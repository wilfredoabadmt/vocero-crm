import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuth, requireAuthUser } from '../../auth/guards.js';
import { config, decryptSecret, encryptSecret } from '../../config.js';
import { db } from '../../db/client.js';
import { settings, users } from '../../db/schema.js';
import { badRequest } from '../../lib/errors.js';
import { validateLlmKey, listFreeModels, type LlmProvider, FREE_MODELS } from '../../integrations/llm/client.js';
import { listModels } from '../../integrations/openrouter/client.js';

export const ALL_PROVIDERS: LlmProvider[] = ['openai', 'gemini', 'zhipu', 'openrouter', 'ollama', 'groq', 'together', 'huggingface', 'mistral', 'opencode'];

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string | null) {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function getLlmKey(provider: LlmProvider): Promise<string | null> {
  const enc = await getSetting(`${provider}_api_key_enc`);
  if (!enc) return null;
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}

export async function getOpenRouterKey(): Promise<string | null> {
  return getLlmKey('openrouter');
}

export function settingsRoutes(app: FastifyInstance) {
  // ---- API Keys CRUD ----

  app.get('/api/settings/keys', { preHandler: requireAuth }, async () => {
    const result: Record<string, { configured: boolean; last4: string | null }> = {};
    for (const p of ALL_PROVIDERS) {
      const key = await getLlmKey(p);
      result[p] = {
        configured: !!key,
        last4: key ? key.slice(-4) : null,
      };
    }
    return result;
  });

  app.put('/api/settings/keys', { preHandler: requireAdmin }, async (request) => {
    const { provider, api_key } = z
      .object({
        provider: z.enum(ALL_PROVIDERS as [string, ...string[]]),
        api_key: z.string().min(1).max(500),
      })
      .parse(request.body);

    const typedProvider = provider as LlmProvider;

    // Ollama puede funcionar sin API key (url del servidor local)
    if (typedProvider === 'ollama') {
      const url = api_key.trim() || 'http://localhost:11434';
      await setSetting('ollama_api_key_enc', encryptSecret(url));
      return { configured: true, last4: url.slice(-4) };
    }

    // OpenCode local
    if (typedProvider === 'opencode') {
      const url = api_key.trim() || 'http://localhost:4010';
      await setSetting('opencode_api_key_enc', encryptSecret(url));
      return { configured: true, last4: url.slice(-4) };
    }

    if (api_key.trim().length < 8) throw badRequest('INVALID_API_KEY', 'La API key debe tener al menos 8 caracteres');

    const valid = await validateLlmKey(typedProvider, api_key.trim());
    if (!valid) throw badRequest('INVALID_API_KEY', `La API key de ${provider} no pudo ser validada`);

    await setSetting(`${provider}_api_key_enc`, encryptSecret(api_key.trim()));
    return { configured: true, last4: api_key.trim().slice(-4) };
  });

  app.delete('/api/settings/keys/:provider', { preHandler: requireAdmin }, async (request) => {
    const { provider } = z.object({ provider: z.enum(ALL_PROVIDERS as [string, ...string[]]) }).parse(request.params);
    await setSetting(`${provider}_api_key_enc`, null);
    return { configured: false };
  });

  // ---- OpenRouter compat (mantener para retrocompatibilidad) ----

  app.get('/api/settings/openrouter-key', { preHandler: requireAuth }, async () => {
    const key = await getLlmKey('openrouter');
    return { configured: !!key, last4: key ? key.slice(-4) : null };
  });

  app.put('/api/settings/openrouter-key', { preHandler: requireAdmin }, async (request) => {
    const { api_key } = z.object({ api_key: z.string().min(8).max(300) }).parse(request.body);
    const valid = await validateLlmKey('openrouter', api_key.trim());
    if (!valid) throw badRequest('INVALID_API_KEY', 'OpenRouter rechazó esta API key');
    await setSetting('openrouter_api_key_enc', encryptSecret(api_key.trim()));
    return { configured: true, last4: api_key.trim().slice(-4) };
  });

  app.delete('/api/settings/openrouter-key', { preHandler: requireAdmin }, async () => {
    await setSetting('openrouter_api_key_enc', null);
    return { configured: false };
  });

  // ---- AI global toggle ----

  app.get('/api/settings/ai', { preHandler: requireAuth }, async () => {
    return { enabled: (await getSetting('ai_global_enabled')) !== 'false' };
  });

  app.put('/api/settings/ai', { preHandler: requireAdmin }, async (request) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    await setSetting('ai_global_enabled', String(enabled));
    return { enabled };
  });

  // ---- Modelos disponibles (todos los proveedores) ----

  app.get('/api/ai/models', { preHandler: requireAuth }, async () => {
    const items: { id: string; name: string; provider: string; isFree?: boolean }[] = [];

    // Modelos de OpenRouter
    const openrouterKey = await getLlmKey('openrouter');
    if (openrouterKey) {
      try {
        const orModels = await listModels(openrouterKey);
        items.push(...orModels.map((m) => ({ id: m.id, name: `${m.name} (OpenRouter)`, provider: 'openrouter' })));
      } catch {
        // Falla seguro
      }
    }

    // Modelos de OpenAI
    const openaiKey = await getLlmKey('openai');
    if (openaiKey) {
      items.push(
        { id: 'gpt-4o', name: 'GPT-4o (OpenAI)', provider: 'openai' },
        { id: 'gpt-4o-mini', name: 'GPT-4o-mini (OpenAI)', provider: 'openai' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (OpenAI)', provider: 'openai' },
      );
    }

    // Modelos de Gemini
    const geminiKey = await getLlmKey('gemini');
    if (geminiKey) {
      items.push(
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Google)', provider: 'gemini' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Google)', provider: 'gemini' },
      );
    }

    // Modelos de Zhipu
    const zhipuKey = await getLlmKey('zhipu');
    if (zhipuKey) {
      items.push(
        { id: 'glm-4-flash', name: 'GLM 4 Flash (Zhipu AI)', provider: 'zhipu' },
        { id: 'glm-4', name: 'GLM 4 (Zhipu AI)', provider: 'zhipu' },
      );
    }

    // Modelos gratuitos de Ollama
    const ollamaKey = await getLlmKey('ollama');
    if (ollamaKey) {
      const ollamaModels = await listFreeModels('ollama', ollamaKey);
      items.push(...ollamaModels.map((m) => ({ id: m.id, name: `${m.name} (Ollama)`, provider: 'ollama', isFree: true })));
    }

    // Modelos gratuitos de Groq
    const groqKey = await getLlmKey('groq');
    if (groqKey) {
      const groqModels = await listFreeModels('groq', groqKey);
      items.push(...groqModels.map((m) => ({ id: m.id, name: `${m.name} (Groq)`, provider: 'groq', isFree: true })));
    }

    // Modelos gratuitos de Together
    const togetherKey = await getLlmKey('together');
    if (togetherKey) {
      const togetherModels = await listFreeModels('together', togetherKey);
      items.push(...togetherModels.map((m) => ({ id: m.id, name: `${m.name} (Together)`, provider: 'together', isFree: true })));
    }

    // Modelos gratuitos de HuggingFace
    const hfKey = await getLlmKey('huggingface');
    if (hfKey) {
      const hfModels = await listFreeModels('huggingface', hfKey);
      items.push(...hfModels.map((m) => ({ id: m.id, name: `${m.name} (HuggingFace)`, provider: 'huggingface', isFree: true })));
    }

    // Modelos de Mistral
    const mistralKey = await getLlmKey('mistral');
    if (mistralKey) {
      const mistralModels = await listFreeModels('mistral', mistralKey);
      items.push(...mistralModels.map((m) => ({ id: m.id, name: `${m.name} (Mistral)`, provider: 'mistral', isFree: true })));
    }

    // Modelos de OpenCode
    const opencodeKey = await getLlmKey('opencode');
    if (opencodeKey) {
      const opencodeModels = await listFreeModels('opencode', opencodeKey);
      items.push(...opencodeModels.map((m) => ({ id: `opencode//${m.id}`, name: `${m.name} (OpenCode)`, provider: 'opencode', isFree: true })));
    }

    // Fallback: modelos simulados
    if (items.length === 0 && config.SIMULATION_MODE) {
      items.push(
        { id: 'sim/echo-model', name: 'Modelo Simulado (eco)', provider: 'openrouter' },
        { id: 'sim/echo-model-pro', name: 'Modelo Simulado Pro', provider: 'openrouter' },
      );
    }

    return { items };
  });

  // ---- n8n URL ----

  app.get('/api/settings/n8n-url', { preHandler: requireAuth }, async () => {
    return { url: await getSetting('n8n_iframe_url') };
  });

  app.put('/api/settings/n8n-url', { preHandler: requireAdmin }, async (request) => {
    const { url } = z.object({ url: z.string().url().nullable().or(z.string().length(0)) }).parse(request.body);
    const cleanedUrl = url && url.trim().length > 0 ? url.trim() : null;
    await setSetting('n8n_iframe_url', cleanedUrl);
    return { url: cleanedUrl };
  });

  // ---- Marca Blanca (White Label) ----

  app.get('/api/settings/white-label', { preHandler: requireAuth }, async (request) => {
    const me = requireAuthUser(request);
    
    // Si es agente, buscar al administrador creador
    let adminId = me.id;
    if (me.role === 'agent' && me.created_by) {
      adminId = me.created_by;
    }

    const [adminUser] = await db
      .select({
        brandName: users.brandName,
        brandLogo: users.brandLogo,
        brandAccentColor: users.brandAccentColor,
      })
      .from(users)
      .where(eq(users.id, adminId));

    return {
      name: adminUser?.brandName ?? 'CRM TOI',
      logo: adminUser?.brandLogo ?? '/logo.png',
      accent_color: adminUser?.brandAccentColor ?? '#84cc16',
    };
  });

  app.put('/api/settings/white-label', { preHandler: requireAdmin }, async (request) => {
    const me = requireAuthUser(request);
    const body = z.object({
      name: z.string().min(1).max(100),
      logo: z.string().nullable().optional(),
      accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    }).parse(request.body);

    const updates: Record<string, unknown> = {
      brandName: body.name,
    };
    if (body.logo !== undefined) updates.brandLogo = body.logo;
    if (body.accent_color !== undefined) updates.brandAccentColor = body.accent_color;

    await db.update(users).set(updates).where(eq(users.id, me.id));

    return {
      name: body.name,
      logo: body.logo ?? null,
      accent_color: body.accent_color ?? null,
    };
  });

  app.post('/api/settings/white-label/logo', { preHandler: requireAdmin }, async (request) => {
    const me = requireAuthUser(request);
    const file = await request.file({ limits: { fileSize: 2 * 1024 * 1024 } }); // máx 2MB
    if (!file) throw badRequest('NO_FILE', 'Adjunta una imagen para el logotipo');

    const ext = path.extname(file.filename).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      throw badRequest('INVALID_FILE_TYPE', 'Formatos permitidos: PNG, JPG, JPEG, WEBP');
    }

    const buffer = await file.toBuffer();
    const dir = path.join(config.uploadsDir, 'brand', String(me.id));
    mkdirSync(dir, { recursive: true });
    const safeName = `logo-${Date.now()}${ext}`;
    const filePath = path.join(dir, safeName);
    writeFileSync(filePath, buffer);

    const logoUrl = `/api/uploads/brand/${me.id}/${safeName}`;
    await db.update(users).set({ brandLogo: logoUrl }).where(eq(users.id, me.id));

    return { logo: logoUrl };
  });
}
