/**
 * Acciones tipadas del agente: exactamente UNA por turno.
 *
 * El servidor valida cada acción contra sus allowlists (etapas de la org);
 * lo que no valida se degrada, nunca se ejecuta a ciegas.
 *
 * Para tu SaaS TOI: las acciones base (reply, handoff, none) se mantienen.
 * Las acciones de pipeline (move_stage, update_lead) dependen de tu modelo
 * de datos de abonados.
 */

import { z } from "zod";

// ─── Schema Zod de acción del agente ──────────────────────────────────────────

export const AgentAction = z.discriminatedUnion("action", [
  // No hacer nada (silencio)
  z.object({ action: z.literal("none") }),

  // Responder al cliente
  z.object({ action: z.literal("reply"), text: z.string().min(1) }),

  // Guardar nota/observación sobre el lead/abonado
  z.object({
    action: z.literal("update_lead"),
    note: z.string().min(1),
    reply: z.string().optional(),
  }),

  // Mover el lead a una etapa del pipeline
  z.object({
    action: z.literal("move_stage"),
    stage: z.string().min(1),
    reply: z.string().optional(),
  }),

  // Escalar a un humano
  z.object({
    action: z.literal("handoff"),
    reason: z.string().optional(),
    farewell: z.string().optional(),
  }),
]);

export type AgentActionType = z.infer<typeof AgentAction>;

// ─── Utilidades ───────────────────────────────────────────────────────────────

/**
 * Resuelve el nombre de etapa devuelto por el modelo contra las etapas
 * reales de la organización (exacto → lower-case). Sin match: null.
 */
export function resolveStage(
  requested: string,
  stages: { id: string; name: string }[]
): { id: string; name: string } | null {
  const exact = stages.find((s) => s.name === requested.trim());
  if (exact) return exact;

  const lower = requested.trim().toLowerCase();
  return stages.find((s) => s.name.toLowerCase() === lower) ?? null;
}

/**
 * Degrada una move_stage sin etapa válida: si trae reply, lo conserva
 * como respuesta normal; si no, devuelve none.
 */
export function degradeAction(action: AgentActionType): AgentActionType {
  if (action.action === "move_stage") {
    return action.reply
      ? { action: "reply", text: action.reply }
      : { action: "none" };
  }
  return action;
}
