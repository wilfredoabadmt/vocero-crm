import type { z } from "zod";

/**
 * Adaptador LLM OpenRouter-compatible — ÚNICA frontera con el proveedor de IA.
 *
 * Regla operativa: la salida del modelo es impredecible; todo consumo pasa por
 * extracción robusta + Zod + reintentos, y un hipo del proveedor JAMÁS propaga
 * excepción al turno (devuelve resultado `error` tipado).
 *
 * AUTOCONTENIDO a propósito: lee `process.env` directo para que puedas pegarlo
 * en tu repo sin acoplarlo a tu módulo de env. Si ya tienes uno validado con
 * Zod, sustituye `aiEnv()` por tu `getEnv()`.
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatJsonResult<T> =
  | { ok: true; data: T; raw: string }
  | {
      ok: false;
      error: "not_configured" | "provider_error" | "invalid_output";
      detail: string;
    };

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;
const DEFAULT_TIMEOUT_MS = 60_000;

type AiEnv = {
  token: string | null;
  baseUrl: string;
  model: string | null;
  judgeModel: string | null;
  temperature: number;
};

let cachedEnv: AiEnv | null = null;

function aiEnv(): AiEnv {
  if (cachedEnv) return cachedEnv;
  const trim = (v: string | undefined) => {
    const s = (v ?? "").trim();
    return s.length > 0 ? s : null;
  };
  const rawTemp = Number(process.env.OPENROUTER_TEMPERATURE);
  cachedEnv = {
    token: trim(process.env.OPENROUTER_API_TOKEN),
    baseUrl: trim(process.env.OPENROUTER_BASE_URL) ?? "https://openrouter.ai/api",
    model: trim(process.env.OPENROUTER_MODEL),
    judgeModel: trim(process.env.OPENROUTER_JUDGE_MODEL),
    // Cobranza y soporte quieren respuestas estables, no creativas.
    temperature: Number.isFinite(rawTemp) ? rawTemp : 0.2,
  };
  return cachedEnv;
}

/** Sólo para tests: invalida el cache de configuración. */
export function resetAiEnvCache(): void {
  cachedEnv = null;
}

/** true si hay proveedor de IA configurado (token presente y no vacío). */
export function isAiConfigured(): boolean {
  return aiEnv().token !== null;
}

export async function chatJson<T>(
  schema: z.ZodType<T>,
  messages: ChatMessage[],
  opts?: { model?: string; judge?: boolean; timeoutMs?: number }
): Promise<ChatJsonResult<T>> {
  const env = aiEnv();
  if (!env.token) {
    return {
      ok: false,
      error: "not_configured",
      detail: "Sin OPENROUTER_API_TOKEN configurado",
    };
  }
  const model =
    opts?.model ?? (opts?.judge ? (env.judgeModel ?? env.model) : env.model);
  if (!model) {
    return {
      ok: false,
      error: "not_configured",
      detail: "Sin OPENROUTER_MODEL configurado",
    };
  }

  let lastDetail = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptMessages: ChatMessage[] =
      attempt === 1
        ? messages
        : [
            ...messages,
            {
              role: "system",
              content:
                "STRICT: tu respuesta anterior no fue JSON válido según el esquema. Responde ÚNICAMENTE el objeto JSON, sin explicaciones ni markdown.",
            },
          ];
    try {
      const raw = await callProvider(model, attemptMessages, opts?.timeoutMs);
      const extracted = extractJson(raw);
      if (extracted === null) {
        lastDetail = `sin JSON extraíble (raw=${truncate(raw)})`;
        continue;
      }
      const parsed = schema.safeParse(extracted);
      if (!parsed.success) {
        lastDetail = `no cumple el esquema: ${parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")} (raw=${truncate(raw)})`;
        continue;
      }
      return { ok: true, data: parsed.data, raw };
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  return {
    ok: false,
    error:
      lastDetail.includes("esquema") || lastDetail.includes("JSON")
        ? "invalid_output"
        : "provider_error",
    detail: lastDetail,
  };
}

async function callProvider(
  model: string,
  messages: ChatMessage[],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<string> {
  const env = aiEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        // El token JAMÁS se loguea; sólo viaja en este header.
        Authorization: `Bearer ${env.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: env.temperature,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`proveedor respondió ${res.status}: ${truncate(text)}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("respuesta del proveedor sin contenido");
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extracción robusta de JSON de una respuesta de modelo:
 * 1) bloque ```json … ``` (o ``` … ```), 2) el texto completo,
 * 3) del primer `{` al último `}`.
 */
export function extractJson(raw: string): unknown | null {
  const candidates: string[] = [];
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());
  candidates.push(raw.trim());
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) {
    candidates.push(raw.slice(first, last + 1));
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // siguiente candidato
    }
  }
  return null;
}

function truncate(s: string, n = 300): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
