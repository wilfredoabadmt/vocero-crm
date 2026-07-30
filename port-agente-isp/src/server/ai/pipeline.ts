import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { chatJson, isAiConfigured, type ChatMessage } from "@/lib/ai";
import { getAccountSnapshot } from "@/server/ai/account";
import { AgentAction, degradeAction, type AgentActionType } from "@/server/ai/actions";
import {
  detectHandoffIntent,
  handoffFarewell,
  type HandoffReason,
} from "@/server/ai/handoff";
import {
  execCrearTicket,
  execNotaAbonado,
  execRegistrarComprobante,
  execRegistrarPromesa,
} from "@/server/ai/executors";
import { buildAgentSystemPrompt, describeNonTextMessage } from "@/server/ai/prompts";

// ⚠️ ADAPTAR: tu emisor de WhatsApp y tu bus de eventos SSE.
import { publish } from "@/server/events/bus";
import { isWindowOpen } from "@/server/inbox/window";
import { SendError, sendText } from "@/server/inbox/send";

/**
 * TURNO DEL AGENTE.
 *
 * Coalesce + lock in-process por conversación: una ráfaga de mensajes produce
 * UNA respuesta; nunca corren dos turnos simultáneos para la misma
 * conversación; lo que llega durante un turno re-encola exactamente uno más.
 * Suficiente para un monolito de una instancia — sin colas externas.
 */

const HISTORY_LIMIT = 20;

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

function coalesceMs(): number {
  const raw = Number(process.env.AGENT_COALESCE_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 6000;
}

/** Punto de entrada con debounce (mensajes entrantes reales). */
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
  entry.timer = setTimeout(() => {
    entry.timer = null;
    void executeTurn(conversationId);
  }, coalesceMs());
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
      void executeTurn(conversationId);
    } else {
      map.delete(conversationId);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* El turno                                                                    */
/* -------------------------------------------------------------------------- */

/** Ejecuta UN turno ahora (sin debounce). Lo usan los tests y el laboratorio. */
export async function runAgentTurn(conversationId: string): Promise<void> {
  if (!isAiConfigured()) return;

  const db = getDb();

  // ── 1. Conversación + contacto ────────────────────────────────────────────
  // ⚠️ ADAPTAR: si el teléfono vive en la conversación, quita el join.
  const rows = await db
    .select({
      conversation: schema.conversation,
      phone: schema.contact.phone,
    })
    .from(schema.conversation)
    .innerJoin(schema.contact, eq(schema.conversation.contactId, schema.contact.id))
    .where(eq(schema.conversation.id, conversationId))
    .limit(1);

  const row = rows[0];
  if (!row) return;
  const conversation = row.conversation;
  const organizationId = conversation.organizationId;

  // ── 2. Condiciones de silencio ────────────────────────────────────────────
  if (conversation.handoffAt) return; // ya está en manos de una persona
  if (!conversation.aiEnabled) return; // apagado en esta conversación

  const profileRows = await db
    .select()
    .from(schema.agentProfile)
    .where(eq(schema.agentProfile.organizationId, organizationId))
    .limit(1);
  const profile = profileRows[0];
  if (!profile) return;
  if (!conversation.isTest && !profile.enabled) return; // apagado global

  // ── 3. Historial ──────────────────────────────────────────────────────────
  const history = await db
    .select()
    .from(schema.message)
    .where(eq(schema.message.conversationId, conversationId))
    .orderBy(desc(schema.message.createdAt))
    .limit(HISTORY_LIMIT);
  history.reverse();

  const lastInbound = [...history].reverse().find((m) => m.direction === "in");
  if (!lastInbound) return; // nada que responder

  // Última imagen/documento entrante: habilita `registrar_comprobante`.
  const lastMedia =
    [...history]
      .reverse()
      .find(
        (m) =>
          m.direction === "in" && (m.type === "image" || m.type === "document")
      ) ?? null;

  // ── 4. Ventana de 24h ─────────────────────────────────────────────────────
  // Cerrada → el agente JAMÁS envía texto libre: escala en silencio.
  if (!conversation.isTest && !isWindowOpen(conversation.lastInboundAt)) {
    await applyHandoff(conversationId, organizationId, "ventana");
    return;
  }

  // ── 5. Respaldo de escalado ANTES del LLM ─────────────────────────────────
  if (lastInbound.text) {
    const reason = detectHandoffIntent(lastInbound.text);
    if (reason) {
      const farewell = handoffFarewell(reason);
      if (farewell) await deliverReply(conversation, farewell);
      await applyHandoff(conversationId, organizationId, reason);
      return;
    }
  }

  // ── 6. Contexto verificado ────────────────────────────────────────────────
  const kb = await db
    .select()
    .from(schema.kbEntry)
    .where(eq(schema.kbEntry.organizationId, organizationId))
    .orderBy(asc(schema.kbEntry.createdAt));

  const account = await getAccountSnapshot({
    organizationId,
    phone: row.phone,
  });

  // ── 7. Llamada al modelo ──────────────────────────────────────────────────
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildAgentSystemPrompt({
        profile,
        kb,
        account,
        isTest: conversation.isTest,
      }),
    },
    // Un entrante sin texto (imagen, audio) se describe para que el modelo
    // sepa que existió; un SALIENTE sin texto simplemente se omite.
    ...history.flatMap((m) => {
      const text = m.text?.trim();
      if (text) {
        return [
          {
            role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
            content: text,
          },
        ];
      }
      if (m.direction !== "in") return [];
      return [{ role: "user" as const, content: describeNonTextMessage(m.type) }];
    }),
  ];

  const result = await chatJson(AgentAction, messages);
  if (!result.ok) {
    if (result.error === "not_configured") return;
    // Fallo persistente del proveedor → escalar, nunca quedarse mudo.
    console.error(`[agente] fallo del proveedor: ${result.error} — ${result.detail}`);
    await applyHandoff(conversationId, organizationId, "error");
    return;
  }

  // ── 8. Validación + ejecución ─────────────────────────────────────────────
  await applyAction({
    action: result.data,
    conversation,
    profile,
    account,
    // ⚠️ ADAPTAR: `waMediaId` es la columna donde guardas el media_id de Meta
    // (o la clave de S3 si ya lo descargaste). Si no existe, pasa null.
    lastMedia: lastMedia
      ? { id: lastMedia.id, mediaId: lastMedia.waMediaId ?? null }
      : null,
  });
}

/* -------------------------------------------------------------------------- */
/* Ejecución de la acción                                                      */
/* -------------------------------------------------------------------------- */

type Conversation = typeof schema.conversation.$inferSelect;
type AgentProfile = typeof schema.agentProfile.$inferSelect;
type Account = Awaited<ReturnType<typeof getAccountSnapshot>>;

async function applyAction(input: {
  action: AgentActionType;
  conversation: Conversation;
  profile: AgentProfile;
  account: Account;
  lastMedia: { id: string; mediaId: string | null } | null;
}): Promise<void> {
  const { conversation, profile, account } = input;
  let action = input.action;

  // Las acciones de dominio necesitan un abonado identificado. Si el teléfono
  // no está registrado, se degradan (nunca se escribe contra un abonado "nulo").
  const needsSubscriber =
    action.action === "registrar_promesa_pago" ||
    action.action === "crear_ticket" ||
    action.action === "registrar_comprobante" ||
    action.action === "nota_abonado";

  if (needsSubscriber && !account.subscriberId) {
    action = degradeAction(action);
  }

  const ctx = {
    organizationId: conversation.organizationId,
    conversationId: conversation.id,
    subscriberId: account.subscriberId ?? "",
    profile: {
      allowPaymentPromise: profile.allowPaymentPromise,
      allowTicketCreation: profile.allowTicketCreation,
      allowReceiptCapture: profile.allowReceiptCapture,
      maxPromiseDays: profile.maxPromiseDays,
    },
  };

  switch (action.action) {
    case "none":
      return;

    case "reply":
      await deliverReply(conversation, action.text);
      return;

    case "nota_abonado": {
      const res = await execNotaAbonado(ctx, action);
      if (!res.ok) console.warn(`[agente] nota descartada: ${res.reason}`);
      if (action.reply) await deliverReply(conversation, action.reply);
      return;
    }

    case "registrar_promesa_pago": {
      const res = await execRegistrarPromesa(ctx, action);
      if (!res.ok) {
        console.warn(`[agente] promesa rechazada: ${res.reason}`);
        // Degradar: el abonado igual recibe la respuesta que el modelo escribió.
        await deliverReply(conversation, action.reply);
        return;
      }
      await deliverReply(conversation, action.reply);
      notifyUpdated(conversation.organizationId, conversation.id);
      return;
    }

    case "crear_ticket": {
      const res = await execCrearTicket(ctx, action);
      if (!res.ok) {
        console.warn(`[agente] ticket rechazado: ${res.reason}`);
        // Un problema técnico sin ticket es un problema sin dueño: escalamos.
        await deliverReply(conversation, action.reply);
        await applyHandoff(
          conversation.id,
          conversation.organizationId,
          "modelo"
        );
        return;
      }
      await deliverReply(conversation, action.reply);
      notifyUpdated(conversation.organizationId, conversation.id);
      return;
    }

    case "registrar_comprobante": {
      const res = await execRegistrarComprobante(ctx, action, input.lastMedia);
      if (!res.ok) {
        console.warn(`[agente] comprobante rechazado: ${res.reason}`);
        await deliverReply(
          conversation,
          "Para registrar tu pago necesito la foto o captura del comprobante. ¿Me la puedes enviar?"
        );
        return;
      }
      await deliverReply(conversation, action.reply);
      notifyUpdated(conversation.organizationId, conversation.id);
      return;
    }

    case "handoff": {
      if (action.farewell) await deliverReply(conversation, action.farewell);
      await applyHandoff(conversation.id, conversation.organizationId, "modelo");
      return;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Entrega y escalado                                                          */
/* -------------------------------------------------------------------------- */

/** Entrega la respuesta: envío real o persistencia sandbox (conversación de prueba). */
async function deliverReply(
  conversation: Conversation,
  text: string
): Promise<void> {
  if (conversation.isTest) {
    await persistTestOutbound(conversation, text);
    return;
  }
  try {
    await sendText({
      conversationId: conversation.id,
      organizationId: conversation.organizationId,
      text,
      aiGenerated: true,
    });
  } catch (err) {
    if (err instanceof SendError && err.code === "window_closed") {
      await applyHandoff(conversation.id, conversation.organizationId, "ventana");
      return;
    }
    // Un fallo de envío no debe tumbar el turno: se registra y se escala.
    console.error("[agente] envío falló:", err);
    await applyHandoff(conversation.id, conversation.organizationId, "error");
  }
}

/**
 * Mensaje saliente de una conversación de PRUEBA: se persiste, JAMÁS toca la
 * API de WhatsApp. Este es un guardrail, no una limitación: no lo "arregles".
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

export async function applyHandoff(
  conversationId: string,
  organizationId: string,
  reason: HandoffReason
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

  // ⚠️ ADAPTAR/BORRAR: notificación en tiempo real a la bandeja.
  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversationId, handoffReason: reason } },
  });
}

/** ⚠️ ADAPTAR/BORRAR: único punto que toca el bus SSE fuera del handoff. */
function notifyUpdated(organizationId: string, conversationId: string): void {
  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversationId } },
  });
}
