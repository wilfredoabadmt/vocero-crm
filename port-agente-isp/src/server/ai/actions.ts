import { z } from "zod";

/**
 * Acción tipada del agente: exactamente UNA por turno.
 *
 * Principio de diseño (heredado de Vocero y endurecido para cobranza):
 *  · Los datos de SÓLO LECTURA (saldo, plan, estado del servicio, tickets)
 *    NO son acciones: se inyectan en el prompt como contexto verificado.
 *    Así el modelo nunca "consulta" y nunca inventa cifras.
 *  · Las acciones existen sólo para EFECTOS SECUNDARIOS (escribir en la BD).
 *  · Todo lo que el modelo propone se valida contra allowlists del servidor;
 *    lo que no valida se DEGRADA, nunca se ejecuta a ciegas.
 *
 * Deliberadamente AUSENTES (guardrails duros, no los agregues):
 *  · reconectar / cortar el servicio en MikroTik  → acción de infraestructura
 *  · aprobar un pago o condonar deuda             → decisión de dinero
 *  · dar de baja / cancelar el contrato           → retención es humana
 *  Los tres son irreversibles o costosos: el agente escala, no ejecuta.
 */

/** Categorías de ticket que el agente puede abrir. */
export const TICKET_CATEGORIES = [
  "sin_servicio",
  "lentitud",
  "intermitencia",
  "cableado",
  "equipo_dañado",
  "cambio_domicilio",
  "otro",
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const AgentAction = z.discriminatedUnion("action", [
  /** No responder nada (p. ej. el cliente sólo dijo "gracias" tras cerrar). */
  z.object({ action: z.literal("none") }),

  /** Responder al abonado. */
  z.object({ action: z.literal("reply"), text: z.string().min(1) }),

  /** Dejar una nota en el expediente del abonado. */
  z.object({
    action: z.literal("nota_abonado"),
    note: z.string().min(1).max(1000),
    reply: z.string().optional(),
  }),

  /** Registrar un compromiso de pago con fecha. */
  z.object({
    action: z.literal("registrar_promesa_pago"),
    fecha: z.string().min(1), // YYYY-MM-DD; se valida contra el calendario
    monto: z.number().positive().optional(),
    reply: z.string().min(1),
  }),

  /** Abrir un ticket de soporte técnico. */
  z.object({
    action: z.literal("crear_ticket"),
    categoria: z.string().min(1), // se resuelve contra TICKET_CATEGORIES
    descripcion: z.string().min(1).max(1000),
    reply: z.string().min(1),
  }),

  /** Registrar el comprobante que el abonado acaba de mandar como imagen. */
  z.object({
    action: z.literal("registrar_comprobante"),
    monto: z.number().positive().optional(),
    referencia: z.string().max(120).optional(),
    reply: z.string().min(1),
  }),

  /** Escalar a una persona del equipo. */
  z.object({
    action: z.literal("handoff"),
    reason: z.string().optional(),
    farewell: z.string().optional(),
  }),
]);

export type AgentActionType = z.infer<typeof AgentAction>;

/* -------------------------------------------------------------------------- */
/* Validación server-side                                                      */
/* -------------------------------------------------------------------------- */

/** Quita acentos y normaliza separadores: "Equipo Dañado" → "equipo_danado". */
function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s-]+/g, "_");
}

/** Resuelve la categoría propuesta por el modelo contra la allowlist. */
export function resolveTicketCategory(requested: string): TicketCategory | null {
  const norm = normalizeKey(requested);
  return TICKET_CATEGORIES.find((c) => normalizeKey(c) === norm) ?? null;
}

export type PromiseDateResult =
  | { ok: true; date: string }
  | { ok: false; reason: "formato" | "pasada" | "muy_lejana" };

/**
 * Valida la fecha de una promesa de pago.
 * Reglas: formato YYYY-MM-DD real, no anterior a hoy, y como máximo
 * `maxDays` días hacia adelante (configurable por organización).
 */
export function validatePromiseDate(
  raw: string,
  opts: { maxDays: number; today?: Date }
): PromiseDateResult {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { ok: false, reason: "formato" };
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return { ok: false, reason: "formato" };
  // Rechaza fechas "válidas" por desbordamiento (2026-02-31 → 3 de marzo).
  if (parsed.toISOString().slice(0, 10) !== trimmed) {
    return { ok: false, reason: "formato" };
  }

  const now = opts.today ?? new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((parsed.getTime() - todayUtc) / dayMs);

  if (diffDays < 0) return { ok: false, reason: "pasada" };
  if (diffDays > opts.maxDays) return { ok: false, reason: "muy_lejana" };
  return { ok: true, date: trimmed };
}

/**
 * Degrada una acción cuya validación falló: si traía texto para el cliente,
 * al menos se lo decimos; si no, nos callamos. Nunca se ejecuta a medias.
 */
export function degradeAction(action: AgentActionType): AgentActionType {
  if ("reply" in action && typeof action.reply === "string" && action.reply) {
    return { action: "reply", text: action.reply };
  }
  if (action.action === "reply" || action.action === "none") return action;
  return { action: "none" };
}
