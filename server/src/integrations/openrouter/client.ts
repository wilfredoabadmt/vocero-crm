import { config } from '../../config.js';

const OR_BASE = 'https://openrouter.ai/api/v1';

export class OpenRouterError extends Error {
  constructor(
    public kind: 'invalid_key' | 'model_unavailable' | 'rate_limited' | 'provider_error',
    message: string,
  ) {
    super(message);
  }
}

export interface OrModel {
  id: string;
  name: string;
  context_length: number | null;
  prompt_price: string | null;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Clave mágica para E2E sin gastar créditos (solo con SIMULATION_MODE)
const isSimKey = (key: string) => config.SIMULATION_MODE && key.startsWith('sk-sim');

const orHeaders = (key: string) => ({
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': config.PUBLIC_URL,
  'X-Title': 'Panel CRM',
});

export async function validateApiKey(key: string): Promise<boolean> {
  if (isSimKey(key)) return true;
  const res = await fetch(`${OR_BASE}/key`, { headers: orHeaders(key) });
  return res.ok;
}

let modelsCache: { at: number; items: OrModel[] } | null = null;

export async function listModels(key: string): Promise<OrModel[]> {
  if (isSimKey(key)) {
    return [
      { id: 'sim/echo-model', name: 'Modelo Simulado (eco)', context_length: 8192, prompt_price: '0' },
      { id: 'sim/echo-model-pro', name: 'Modelo Simulado Pro', context_length: 32768, prompt_price: '0' },
    ];
  }
  if (modelsCache && Date.now() - modelsCache.at < 60 * 60 * 1000) return modelsCache.items;
  const res = await fetch(`${OR_BASE}/models`, { headers: orHeaders(key) });
  if (!res.ok) {
    if (res.status === 401) throw new OpenRouterError('invalid_key', 'API key de OpenRouter inválida');
    throw new OpenRouterError('provider_error', `OpenRouter respondió ${res.status}`);
  }
  const json = (await res.json()) as { data?: Record<string, unknown>[] };
  const items: OrModel[] = (json.data ?? []).map((m) => ({
    id: String(m.id),
    name: String(m.name ?? m.id),
    context_length: typeof m.context_length === 'number' ? m.context_length : null,
    prompt_price: (m.pricing as { prompt?: string } | undefined)?.prompt ?? null,
  }));
  modelsCache = { at: Date.now(), items };
  return items;
}

export async function chatCompletion(key: string, model: string, messages: ChatMessage[]): Promise<string> {
  if (isSimKey(key)) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return `Respuesta simulada del agente: recibido "${(lastUser?.content ?? '').slice(0, 120)}". ¿En qué más puedo ayudarte?`;
  }
  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: orHeaders(key),
    body: JSON.stringify({ model, messages, max_tokens: 700 }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const msg = body.error?.message ?? `OpenRouter respondió ${res.status}`;
    if (res.status === 401) throw new OpenRouterError('invalid_key', 'API key de OpenRouter inválida o revocada');
    if (res.status === 404) throw new OpenRouterError('model_unavailable', `El modelo ${model} no está disponible`);
    if (res.status === 429) throw new OpenRouterError('rate_limited', 'OpenRouter limitó las solicitudes (rate limit)');
    if (res.status === 402) throw new OpenRouterError('invalid_key', 'Crédito agotado en OpenRouter');
    throw new OpenRouterError('provider_error', msg);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new OpenRouterError('provider_error', 'OpenRouter devolvió una respuesta vacía');
  return content;
}
