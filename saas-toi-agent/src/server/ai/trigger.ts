/**
 * Punto de enganche del turno del agente tras la ingesta de un mensaje entrante.
 *
 * Este archivo se llama desde tu webhook handler (el que procesa los mensajes
 * entrantes de WhatsApp) después de persistir el mensaje en BD.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CÓMO USARLO EN TU SaaS TOI:
 *
 * En tu handler de webhook de WhatsApp (POST /api/webhook/whatsapp), después
 * de ingestar el mensaje, llama:
 *
 *   import { maybeRunAgentTurn } from "@/server/ai/trigger";
 *
 *   // Después de guardar el mensaje entrante en BD:
 *   await maybeRunAgentTurn(conversationId);
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { scheduleAgentTurn } from "@/server/ai/pipeline";
import { isAiConfigured } from "@/lib/ai";

/**
 * Llama al pipeline del agente SI la IA está configurada.
 * No hace nada si no hay token de proveedor.
 */
export async function maybeRunAgentTurn(
  conversationId: string
): Promise<void> {
  if (!isAiConfigured()) return;
  scheduleAgentTurn(conversationId);
}
