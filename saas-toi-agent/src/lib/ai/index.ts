/**
 * Adaptador LLM OpenRouter-compatible — ÚNICA frontera con el proveedor de IA.
 *
 * Regla operativa: la salida del modelo es impredecible; todo consumo pasa
 * por extracción robusta + Zod + reintentos, y un hipo del proveedor jamás
 * propaga excepción (resultado `error` tipado).
 *
 * Para tu SaaS TOI: reemplaza OPENROUTER_* por tu proveedor favorito
 * (OpenAI, Anthropic directo, Groq, etc.) siempre que mantengas la interfaz
 * chatJson(schema, messages).
 */

import type { z } from "zod";

// ─── Configuración del entorno ────────────────────────────────────────────────
// Adapta estas variables a tu sistema de env. En SaaS TOI probablemente
// ya tienes un getEnv() o process.env validado.

interface AiEnv {
  OPENROUTER_API_TOKEN?: string;
  OPENROUTER_BASE_URL: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_JUDGE_MODEL?: string;
}

function getEnv(): AiEnv {
  return {
    OPENROUTER_API_TOKEN: process.env.OPENROUTER_API_TOKEN,
    OPENROUTER_BASE_URL:
      process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api",
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_JUDGE_MODEL: process.env.OPENROUTER_JUDGE_MODEL,
  };
}

/** true si hay proveedor de IA configurado (token presente y no vacío). */
export function isAiConfigured(): boolean {
  const token = process.env.OPENROUTER_API_TOKEN;
  return typeof token === "string" && token.trim().length > 0;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

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

// ─── Configuración de reintentos ──────────────────────────────────────────────

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

/**
 * Llama al proveedor LLM y devuelve JSON parseado contra un esquema Zod.
 *
 * - 3 intentos con backoff lineal.
 * - Extracción robusta de JSON (bloque ```json, texto completo, primer `{...}`).
 * - Un fallo del proveedor NUNCA propaga excepción al caller.
 */
export async function chatJson<T>(
  schema: z.ZodType<T>,
  messages: ChatMessage[],
  opts?: { model?: string; judge?: boolean; timeoutMs?: number }
): Promise<ChatJsonResult<T>> {
  if (!isAiConfigured()) {
    return {
      ok: false,
      error: "not_configured",
      detail: "Sin OPENROUTER_API_TOKEN configurado",
    };
  }

  const env = getEnv();
  const model =
    opts?.model ??
    (opts?.judge
      ? env.OPENROUTER_JUDGE_MODEL ?? env.OPENROUTER_MODEL
      : env.OPENROUTER_MODEL);

  if (!model?.trim()) {
    return {
      ok: false,
      error: "not_configured",
      detail: "Sin OPENROUTER_MODEL configurado",
    };
  }

  let lastDetail = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // En reintentos, refuerza la instrucción de JSON puro
    const attemptMessages: ChatMessage[] =
      attempt === 1
        ? messages
        : [
            ...messages,
            {
              role: "system",
              content:
                "STRICT: tu respuesta anterior no fue JSON válido según el esquema. " +
                "Responde ÚNICAMENTE el objeto JSON, sin explicaciones ni markdown.",
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
          .map((i) => i.path.join(".") + " " + i.message)
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

// ─── Proveedor ────────────────────────────────────────────────────────────────

async function callProvider(
  model: string,
  messages: ChatMessage[],
  timeoutMs = 60_000
): Promise<string> {
  const env = getEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `${env.OPENROUTER_BASE_URL}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages }),
        signal: controller.signal,
      }
    );

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

// ─── Extracción robusta de JSON ───────────────────────────────────────────────

/**
 * Intenta extraer JSON de una respuesta de modelo en orden de preferencia:
 * 1) bloque ```json ... ``` (o ``` ... ```)
 * 2) el texto completo parseado directamente
 * 3) del primer `{` al último `}` (para cuando el modelo agrega texto antes/después)
 */
export function extractJson(raw: string): unknown | null {
  const candidates: string[] = [];

  // 1) Bloque de código
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());

  // 2) Texto completo
  candidates.push(raw.trim());

  // 3) Primer { al último }
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

// ─── Utilidades ───────────────────────────────────────────────────────────────

function truncate(s: string, n = 300): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
