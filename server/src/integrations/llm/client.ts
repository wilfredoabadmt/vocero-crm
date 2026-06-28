import { config } from '../../config.js';

export type LlmProvider = 'openai' | 'gemini' | 'zhipu' | 'openrouter' | 'ollama' | 'groq' | 'together' | 'huggingface' | 'mistral' | 'opencode';

export class LlmError extends Error {
  constructor(
    public kind: 'invalid_key' | 'model_unavailable' | 'rate_limited' | 'provider_error' | 'provider_unavailable',
    message: string,
  ) {
    super(message);
  }
}

export interface LlmModel {
  id: string;
  name: string;
  provider: LlmProvider;
  isFree?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const isSimKey = (key: string) => config.SIMULATION_MODE && key.startsWith('sk-sim');

// ---- Modelos gratuitos por defecto de cada proveedor ----

export const FREE_MODELS: Record<string, { id: string; name: string; provider: LlmProvider }[]> = {
  ollama: [
    { id: 'llama3.1:8b', name: 'Llama 3.1 8B (Local)', provider: 'ollama' },
    { id: 'mistral:7b', name: 'Mistral 7B (Local)', provider: 'ollama' },
    { id: 'phi3:3.8b', name: 'Phi-3 Mini (Local)', provider: 'ollama' },
    { id: 'gemma2:9b', name: 'Gemma 2 9B (Local)', provider: 'ollama' },
    { id: 'qwen2:7b', name: 'Qwen2 7B (Local)', provider: 'ollama' },
    { id: 'codellama:7b', name: 'CodeLlama 7B (Local)', provider: 'ollama' },
  ],
  groq: [
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', provider: 'groq' },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B', provider: 'groq' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', provider: 'groq' },
    { id: 'llama-3-8b-8192', name: 'Llama 3 8B', provider: 'groq' },
  ],
  together: [
    { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', name: 'Llama 3.1 8B Turbo', provider: 'together' },
    { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B', provider: 'together' },
    { id: 'meta-llama/Llama-3-8b-chat-hf', name: 'Llama 3 8B', provider: 'together' },
    { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B', provider: 'together' },
  ],
  huggingface: [
    { id: 'meta-llama/Llama-3-8b-instruct', name: 'Llama 3 8B Instruct', provider: 'huggingface' },
    { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B Instruct', provider: 'huggingface' },
    { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B IT', provider: 'huggingface' },
    { id: 'HuggingFaceH4/zephyr-7b-beta', name: 'Zephyr 7B Beta', provider: 'huggingface' },
  ],
  mistral: [
    { id: 'mistral-tiny-latest', name: 'Mistral Tiny (Free tier)', provider: 'mistral' },
    { id: 'mistral-small-latest', name: 'Mistral Small', provider: 'mistral' },
    { id: 'open-mistral-nemo', name: 'Mistral Nemo', provider: 'mistral' },
  ],
  opencode: [
    { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B (OpenCode)', provider: 'opencode' },
    { id: 'qwen/qwen-2.5-7b-instruct', name: 'Qwen 2.5 7B (OpenCode)', provider: 'opencode' },
    { id: 'microsoft/phi-3-mini-128k-instruct', name: 'Phi-3 Mini (OpenCode)', provider: 'opencode' },
  ],
};

// ---- Validación de API Keys ----

export async function validateLlmKey(
  provider: LlmProvider,
  key: string,
): Promise<boolean> {
  const cleanKey = key.trim();
  if (isSimKey(cleanKey)) return true;

  // Ollama no necesita API key
  if (provider === 'ollama') {
    try {
      const baseUrl = cleanKey || 'http://localhost:11434';
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  // OpenCode local no necesita API key por defecto
  if (provider === 'opencode') {
    try {
      const baseUrl = cleanKey || 'http://localhost:4010';
      const res = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  if (!cleanKey) return false;

  try {
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });
      return res.ok;
    }

    if (provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/openai/models`,
        { headers: { Authorization: `Bearer ${cleanKey}` } },
      );
      return res.ok;
    }

    if (provider === 'zhipu') {
      const res = await fetch('https://open.bigmodel.cn/api/paas/v4/models', {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });
      return res.ok;
    }

    if (provider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/key', {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });
      return res.ok;
    }

    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });
      return res.ok;
    }

    if (provider === 'together') {
      const res = await fetch('https://api.together.xyz/v1/models', {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });
      return res.ok;
    }

    if (provider === 'huggingface') {
      const res = await fetch('https://huggingface.co/api/models?limit=1', {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });
      return res.ok;
    }

    if (provider === 'mistral') {
      const res = await fetch('https://api.mistral.ai/v1/models', {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });
      return res.ok;
    }

    return false;
  } catch {
    return false;
  }
}

// ---- Chat Completion ----

export async function chatLlmCompletion(
  provider: LlmProvider,
  key: string,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const cleanKey = key.trim();
  if (isSimKey(cleanKey)) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return `Respuesta simulada del agente (${provider}): recibido "${(lastUser?.content ?? '').slice(0, 120)}". ¿En qué más puedo ayudarte?`;
  }

  // Ollama: endpoint local sin auth
  if (provider === 'ollama') {
    const baseUrl = cleanKey || 'http://localhost:11434';
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: { num_predict: 700 },
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = body.error ?? `Ollama respondió ${res.status}`;
        if (res.status === 404) throw new LlmError('model_unavailable', `El modelo ${model} no está disponible en Ollama. Ejecuta: ollama pull ${model}`);
        throw new LlmError('provider_error', msg);
      }

      const json = (await res.json()) as { message?: { content?: string } };
      const content = json.message?.content?.trim();
      if (!content) throw new LlmError('provider_error', 'Ollama devolvió una respuesta vacía');
      return content;
    } catch (err) {
      if (err instanceof LlmError) throw err;
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new LlmError('provider_unavailable', 'Ollama no está disponible. Asegúrate de que esté corriendo en localhost:11434');
      }
      throw new LlmError('provider_error', err instanceof Error ? err.message : 'Error de comunicación con Ollama');
    }
  }

  // OpenCode: compatible con OpenAI API en local
  if (provider === 'opencode') {
    const baseUrl = cleanKey || 'http://localhost:4010';
    const cleanModel = model.replace('opencode//', '');
    try {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cleanModel,
          messages,
          max_tokens: 700,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } | string };
        const msg = (typeof body.error === 'object' ? body.error?.message : body.error) ?? `OpenCode respondió ${res.status}`;
        throw new LlmError('provider_error', msg);
      }

      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) throw new LlmError('provider_error', 'OpenCode devolvió una respuesta vacía');
      return content;
    } catch (err) {
      if (err instanceof LlmError) throw err;
      throw new LlmError('provider_error', err instanceof Error ? err.message : 'Error de comunicación con OpenCode');
    }
  }

  // Proveedores basados en OpenAI API
  let url = 'https://api.openai.com/v1/chat/completions';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cleanKey}`,
  };

  if (provider === 'gemini') {
    url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  } else if (provider === 'zhipu') {
    url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  } else if (provider === 'openrouter') {
    url = 'https://openrouter.ai/api/v1/chat/completions';
    headers['HTTP-Referer'] = config.PUBLIC_URL;
    headers['X-Title'] = 'Panel CRM';
  } else if (provider === 'groq') {
    url = 'https://api.groq.com/openai/v1/chat/completions';
  } else if (provider === 'together') {
    url = 'https://api.together.xyz/v1/chat/completions';
  } else if (provider === 'huggingface') {
    // HuggingFace Inference API con formato OpenAI
    url = `https://api-inference.huggingface.co/models/${model}`;
    // HuggingFace usa un formato diferente
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cleanKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: messages.map((m) => `${m.role}: ${m.content}`).join('\n'), parameters: { max_new_tokens: 700 } }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; estimated_time?: number };
        if (res.status === 404) throw new LlmError('model_unavailable', `El modelo ${model} no está disponible en HuggingFace`);
        if (res.status === 503) throw new LlmError('provider_unavailable', `El modelo ${model} está cargándose. Intenta de nuevo en ${body.estimated_time ?? 30}s`);
        throw new LlmError('provider_error', body.error ?? `HuggingFace respondió ${res.status}`);
      }
      const json = (await res.json()) as { generated_text?: string }[];
      const content = (Array.isArray(json) ? json[0]?.generated_text : undefined)?.trim();
      if (!content) throw new LlmError('provider_error', 'HuggingFace devolvió una respuesta vacía');
      return content;
    } catch (err) {
      if (err instanceof LlmError) throw err;
      throw new LlmError('provider_error', err instanceof Error ? err.message : 'Error de comunicación con HuggingFace');
    }
  } else if (provider === 'mistral') {
    url = 'https://api.mistral.ai/v1/chat/completions';
  }

  // OpenAI, Gemini, Zhipu, OpenRouter, Groq, Together, Mistral — formato unificado
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, max_tokens: 700 }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      const msg = body.error?.message ?? `${provider} respondió ${res.status}`;
      if (res.status === 401) throw new LlmError('invalid_key', `API key de ${provider} inválida o vencida`);
      if (res.status === 404) throw new LlmError('model_unavailable', `El modelo ${model} no está disponible en ${provider}`);
      if (res.status === 429) throw new LlmError('rate_limited', `Límite de solicitudes (rate limit) excedido en ${provider}`);
      if (res.status === 402) throw new LlmError('invalid_key', `Crédito agotado en ${provider}`);
      throw new LlmError('provider_error', msg);
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) throw new LlmError('provider_error', `La API de ${provider} retornó una respuesta vacía`);
    return content;
  } catch (err) {
    if (err instanceof LlmError) throw err;
    throw new LlmError('provider_error', err instanceof Error ? err.message : 'Error de comunicación de red');
  }
}

// ---- Listar modelos (para proveedores que lo soportan) ----

export async function listFreeModels(provider: LlmProvider, key: string): Promise<LlmModel[]> {
  // Modelos hardcoded gratuitos
  const freeModels = FREE_MODELS[provider] ?? [];

  // Para Ollama, intentar listar modelos locales
  if (provider === 'ollama') {
    const baseUrl = key.trim() || 'http://localhost:11434';
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = (await res.json()) as { models?: { name: string }[] };
        const localModels = (json.models ?? []).map((m) => ({
          id: m.name,
          name: `${m.name} (Local)`,
          provider: 'ollama' as LlmProvider,
          isFree: true,
        }));
        if (localModels.length > 0) return localModels;
      }
    } catch {
      // Ollama no disponible, usar modelos por defecto
    }
    return freeModels.map((m) => ({ ...m, isFree: true }));
  }

  // Para OpenCode, intentar listar modelos locales del proxy
  if (provider === 'opencode') {
    const baseUrl = key.trim() || 'http://localhost:4010';
    try {
      const res = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = (await res.json()) as { data?: { id: string }[] };
        const localModels = (json.data ?? []).map((m) => ({
          id: m.id,
          name: m.id.split('/').pop() || m.id, // Nombre más legible
          provider: 'opencode' as LlmProvider,
          isFree: true,
        }));
        if (localModels.length > 0) return localModels;
      }
    } catch {
      // Fallback
    }
    return freeModels.map((m) => ({ ...m, isFree: true }));
  }

  // Para Groq, listar modelos disponibles
  if (provider === 'groq' && key.trim()) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${key.trim()}` },
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: { id: string; owned_by?: string }[] };
        const groqModels = (json.data ?? [])
          .filter((m) => m.id.includes('free') || ['llama', 'gemma', 'mixtral'].some((n) => m.id.includes(n)))
          .map((m) => ({
            id: m.id,
            name: `${m.id} (Groq)`,
            provider: 'groq' as LlmProvider,
            isFree: true,
          }));
        if (groqModels.length > 0) return groqModels;
      }
    } catch {
      // fallback
    }
  }

  return freeModels.map((m) => ({ ...m, isFree: true }));
}
