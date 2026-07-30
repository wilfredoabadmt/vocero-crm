/**
 * Pipeline del agente de IA — el motor que procesa cada turno.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FLUJO DE UN TURNO:
 *
 * 1. scheduleAgentTurn() → debounce de 6s (coalesce mensajes en ráfaga)
 * 2. executeTurn() → lock in-process por conversación (nunca 2 turnos simultáneos)
 * 3. runAgentTurn() → el trabajo real:
 *    a. Cargar conversación + perfil + KB + stages
 *    b. Verificar condiciones de silencio (handoff activo, IA apagada)
 *    c. Verificar ventana de 24h
 *    d. Patrón de respaldo de handoff (antes del LLM)
 *    e. Construir system prompt + historial
 *    f. Llamar al LLM con chatJson()
 *    g. Ejecutar la acción resultante
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CÓMO ADAPTARLO A TU SaaS TOI:
 *
 * 1. Reemplaza las llamadas a getDb(), schema.*, etc. por tus propios imports.
 * 2. La función deliverReply() debe enviar por WhatsApp (o persistir si es test).
 * 3. moveLeadToStage() y appendLeadNote() deben operar sobre tus tablas.
 * 4. isWindowOpen() se importa de inbox/window.ts (ya creado arriba).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { chatJson, type ChatMessage } from "@/lib/ai";
import { publish } from "@/server/events/bus";
import { isWindowOpen } from "@/server/inbox/window";
import {
  AgentAction,
  degradeAction,
  resolveStage,
  type AgentActionType,
} from "@/server/ai/actions";
import { matchesHandoffIntent } from "@/server/ai/handoff";
import { buildAgentSystemPrompt } from "@/server/ai/prompts";

// ─── Coalesce (debounce + lock por conversación) ──────────────────────────────

type CoalesceEntry = {
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  pending: boolean;
};

const globalForAgent = globalThis as unknown as {
  __agentCoalesce?: Map<string, CoalesceEntry>;
};

function coalesceMap(): Map<string, CoalesceEntry> {
  if (!globalForAgent.__agentCoalesce) {
    globalForAgent.__agentCoalesce = new Map();
  }
  return globalForAgent.__agentCoalesce;
}

/**
 * Punto de entrada con debounce (mensajes entrantes reales).
 * Si ya hay un turno corriendo para esta conversación, re-encola.
 * Si no, espera AGENT_COALESCE_MS antes de ejecutar.
 */
export function scheduleAgentTurn(conversationId: string): void {
  const map = coalesceMap();
  const entry = map.get(conversationId) ?? {
    timer: null,
    running: false,
    pending: false,
  };
  map.set(conversationId, entry);

  if (entry.running) {
    entry.pending = true; // se re-encola al terminar el turno actual
    return;
  }

  if (entry.timer) clearTimeout(entry.timer);

  // Delay configurable (6s en producción, 0 en Laboratorio)
  const delay = parseInt(process.env.AGENT_COALESCE_MS || "6000", 10);

  entry.timer = setTimeout(() => {
    entry.timer = null;
    void executeTurn(conversationId);
  }, delay);
}

async function executeTurn(conversationId: string): Promise<void> {
  const map = coalesceMap();
  const entry = map.get(conversationId);
  if (!entry || entry.running) return;

  entry.running = true;
  try {
    await runAgentTurn(conversationId);
  } catch (err) {
    console.error("[agente] turno falló:", err);
  } finally {
    entry.running = false;
    if (entry.pending) {
      entry.pending = false;
      void executeTurn(conversationId); // procesa el siguiente pendiente
    } else {
      map.delete(conversationId); // limpieza
    }
  }
}

// ─── Motor principal del turno ────────────────────────────────────────────────

/**
 * Ejecuta UN turno del agente. Puede ser llamado directo (Laboratorio)
 * o vía el coalesce (webhook real).
 */
export async function runAgentTurn(conversationId: string): Promise<void> {
  const db = getDb();

  // 1. Cargar conversación
  const convRows = await db
    .select()
    .from(schema.conversation)
    .where(eq(schema.conversation.id, conversationId))
    .limit(1);
  const conversation = convRows[0];
  if (!conversation) return;
  const organizationId = conversation.organizationId;

  // 2. Condiciones de silencio
  if (conversation.handoffAt || !conversation.aiEnabled) return;

  // 3. Cargar perfil del agente
  const profileRows = await db
    .select()
    .from(schema.agentProfile)
    .where(eq(schema.agentProfile.organizationId, organizationId))
    .limit(1);
  const profile = profileRows[0];
  if (!profile) return;

  // El toggle global aplica a conversaciones reales;
  // el Laboratorio evalúa el comportamiento aunque el agente esté apagado
  if (!conversation.isTest && !profile.enabled) return;

  // 4. Cargar historial (últimos 20 mensajes)
  const history = await db
    .select()
    .from(schema.message)
    .where(eq(schema.message.conversationId, conversationId))
    .orderBy(desc(schema.message.createdAt))
    .limit(20);
  history.reverse(); // cronológico

  const lastInbound = [...history].reverse().find((m) => m.direction === "in");
  if (!lastInbound) return;

  // 5. Ventana cerrada → handoff automático
  if (!conversation.isTest && !isWindowOpen(conversation.lastInboundAt)) {
    await applyHandoff(conversationId, organizationId, "ventana");
    return;
  }

  // 6. Patrón de respaldo ANTES del LLM (detección de handoff)
  if (lastInbound.text && matchesHandoffIntent(lastInbound.text)) {
    await applyHandoff(conversationId, organizationId, "cliente");
    return;
  }

  // 7. Cargar knowledge base y etapas del pipeline
  const kb = await db
    .select()
    .from(schema.kbEntry)
    .where(eq(schema.kbEntry.organizationId, organizationId))
    .orderBy(asc(schema.kbEntry.createdAt));

  const stages = await db
    .select({
      id: schema.pipelineStage.id,
      name: schema.pipelineStage.name,
    })
    .from(schema.pipelineStage)
    .where(eq(schema.pipelineStage.organizationId, organizationId))
    .orderBy(asc(schema.pipelineStage.position));

  // 8. Construir mensajes y llamar al LLM
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildAgentSystemPrompt({ profile, kb, stages }),
    },
    ...history
      .filter((m) => m.text)
      .map((m) => ({
        role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
        content: m.text!,
      })),
  ];

  const result = await chatJson(AgentAction, messages);

  if (!result.ok) {
    if (result.error === "not_configured") return;

    // Fallo persistente del proveedor → escalar a humano
    console.error(
      `[agente] fallo del proveedor (conv=${conversationId}): ${result.detail}`
    );
    await applyHandoff(conversationId, organizationId, "error");
    return;
  }

  let action: AgentActionType = result.data;

  // 9. Ejecutar la acción
  if (action.action === "move_stage") {
    const stage = resolveStage(action.stage, stages);
    if (!stage) {
      action = degradeAction(action); // degrada a reply o none
    } else {
      await moveLeadToStage(organizationId, conversation.contactId, stage.id);
      publish(organizationId, {
        type: "conversation.updated",
        data: { conversation: { id: conversationId } },
      });
      if (action.reply) {
        await deliverReply(conversation, action.reply);
      }
      return; // move_stage ya ejecutado
    }
  }

  switch (action.action) {
    case "none":
      return;

    case "reply":
      await deliverReply(conversation, action.text);
      return;

    case "update_lead": {
      await appendLeadNote(
        organizationId,
        conversation.contactId,
        action.note
      );
      if (action.reply) await deliverReply(conversation, action.reply);
      return;
    }

    case "handoff": {
      if (action.farewell) {
        await deliverReply(conversation, action.farewell);
      }
      await applyHandoff(conversationId, organizationId, "modelo");
      return;
    }
  }
}

// ─── Funciones auxiliares ─────────────────────────────────────────────────────

type Conversation = typeof schema.conversation.$inferSelect;

/**
 * Entrega la respuesta: envío real o persistencia sandbox (is_test).
 */
async function deliverReply(
  conversation: Conversation,
  text: string
): Promise<void> {
  if (conversation.isTest) {
    await persistTestOutbound(conversation, text);
    return;
  }

  try {
    // ─── AQUÍ LLAMAS A TU FUNCIÓN DE ENVÍO POR WHATSAPP ───
    // En SaaS TOI probablemente ya tienes una función sendText() o similar.
    // Adapta los parámetros a tu interfaz.
    await sendTextWhatsApp({
      conversationId: conversation.id,
      organizationId: conversation.organizationId,
      text,
      aiGenerated: true,
    });
  } catch (err) {
    // Si la ventana se cerró durante el envío → handoff
    if (err instanceof Error && err.message.includes("window_closed")) {
      await applyHandoff(
        conversation.id,
        conversation.organizationId,
        "ventana"
      );
      return;
    }
    throw err;
  }
}

/**
 * Mensaje saliente del sandbox: se persiste, JAMÁS toca la API de WhatsApp.
 */
async function persistTestOutbound(
  conversation: Conversation,
  text: string
): Promise<void> {
  const db = getDb();

  await db.insert(schema.message).values({
    id: newId("message"),
    organizationId: conversation.organizationId,
    conversationId: conversation.id,
    direction: "out",
    type: "text",
    text,
    status: "sent",
    aiGenerated: true,
  });

  await db
    .update(schema.conversation)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.conversation.id, conversation.id));
}

/**
 * Aplica handoff a una conversación: silencia al agente y notifica a la UI.
 */
export async function applyHandoff(
  conversationId: string,
  organizationId: string,
  reason: "cliente" | "modelo" | "error" | "ventana"
): Promise<void> {
  const db = getDb();

  const updated = await db
    .update(schema.conversation)
    .set({
      handoffAt: new Date(),
      handoffReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(schema.conversation.id, conversationId))
    .returning();

  if (!updated[0]) return;

  publish(organizationId, {
    type: "conversation.updated",
    data: {
      conversation: { id: conversationId, handoffReason: reason },
    },
  });
}

/**
 * Mueve el lead de un abonado a una etapa del pipeline.
 */
async function moveLeadToStage(
  organizationId: string,
  contactId: string,
  stageId: string
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.lead)
    .set({ stageId, updatedAt: new Date(), lastActivityAt: new Date() })
    .where(eq(schema.lead.contactId, contactId));
}

/**
 * Agrega una nota al contacto/abonado.
 */
async function appendLeadNote(
  organizationId: string,
  contactId: string,
  note: string
): Promise<void> {
  const db = getDb();

  const rows = await db
    .select({ id: schema.contact.id, notes: schema.contact.notes })
    .from(schema.contact)
    .where(eq(schema.contact.id, contactId))
    .limit(1);

  const contact = rows[0];
  if (!contact) return;

  const timestamp = new Date().toISOString();
  const newNotes = contact.notes
    ? `${contact.notes}\n[${timestamp}] ${note}`
    : `[${timestamp}] ${note}`;

  await db
    .update(schema.contact)
    .set({ notes: newNotes, updatedAt: new Date() })
    .where(eq(schema.contact.id, contactId));
}

// ─── Placeholder: reemplaza con tu función de envío por WhatsApp ─────────────

/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  REEMPLAZA ESTA FUNCIÓN con tu implementación real de envío.         ║
 * ║                                                                       ║
 * ║  En SaaS TOI probablemente ya tienes algo como:                       ║
 * ║    import { sendText } from "@/lib/whatsapp/send";                    ║
 * ║                                                                       ║
 * ║  O si usas la lib de Vocero:                                          ║
 * ║    import { sendText } from "@/server/inbox/send";                    ║
 * ║                                                                       ║
 * ║  La función debe:                                                     ║
 * ║  1. Verificar que la ventana de 24h está abierta                      ║
 * ║  2. Obtener credenciales de WhatsApp de la organización               ║
 * ║  3. Enviar el mensaje vía Graph API                                   ║
 * ║  4. Persistir el mensaje en BD                                        ║
 * ║  5. Lanzar error con código "window_closed" si la ventana está cerrada ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */
async function sendTextWhatsApp(input: {
  conversationId: string;
  organizationId: string;
  text: string;
  aiGenerated: boolean;
}): Promise<void> {
  // TODO: Implementar con tu lógica de envío de WhatsApp
  // Ejemplo con la lib de Vocero:
  //
  // import { sendText } from "@/server/inbox/send";
  // await sendText(input);
  //
  // Por ahora solo persistimos el mensaje (sandbox)
  const db = getDb();

  await db.insert(schema.message).values({
    id: newId("message"),
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    direction: "out",
    type: "text",
    text: input.text,
    status: "sent",
    aiGenerated: input.aiGenerated,
  });

  await db
    .update(schema.conversation)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.conversation.id, input.conversationId));

  console.log(
    `[agente] mensaje enviado (sandbox) a conv=${input.conversationId}`
  );
}
