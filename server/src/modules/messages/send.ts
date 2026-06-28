import { and, eq } from 'drizzle-orm';
import { config, decryptSecret } from '../../config.js';
import { db } from '../../db/client.js';
import { contacts, conversations, inboxes, messages, templates } from '../../db/schema.js';
import { GraphApiError, getGraphClient } from '../../integrations/whatsapp/index.js';
import { badRequest, notFound, unprocessable } from '../../lib/errors.js';
import { broadcast } from '../../realtime/hub.js';
import { serializeConversation } from '../conversations/serialize.js';
import { windowState } from '../conversations/window.js';
import { previewFor, serializeMessage, type SerializedMessage } from './serialize.js';
import { emitEvent } from '../../lib/events.js';
import { isSubscriptionActive } from '../../integrations/stripe.js';

export type OutboundPayload =
  | { type: 'text'; body: string }
  | { type: 'template'; template_id: number; variables: string[] };

export type OutboundAuthor =
  | { kind: 'user'; userId: number; name: string }
  | { kind: 'ai_agent'; agentId: number; name: string };

export function renderTemplateBody(body: string, variables: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => variables[Number(n) - 1] ?? '');
}

/**
 * Envío saliente unificado (asesores y agentes IA).
 * Aplica la ventana de 24 h con bloqueo pesimista sobre la conversación.
 */
export async function sendMessage(
  conversationId: number,
  payload: OutboundPayload,
  author: OutboundAuthor,
): Promise<SerializedMessage> {
  // Bloqueo + validaciones dentro de la transacción (carrera: ventana expira al enviar)
  const prepared = await db.transaction(async (tx) => {
    const [conversation] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .for('update');
    if (!conversation) throw notFound('Conversación no encontrada');

    const active = await isSubscriptionActive();
    if (!active) {
      throw unprocessable('SUBSCRIPTION_INACTIVE', 'Tu suscripción al CRM está inactiva. Por favor, regulariza tu facturación en la configuración para continuar enviando mensajes.');
    }

    const [contact] = await tx.select().from(contacts).where(eq(contacts.id, conversation.contactId));
    const [inbox] = await tx.select().from(inboxes).where(eq(inboxes.id, conversation.inboxId));
    if (!contact || !inbox) throw notFound('Conversación incompleta');
    if (inbox.status !== 'connected') {
      throw unprocessable('INBOX_NOT_CONNECTED', 'La bandeja de esta conversación no está conectada');
    }

    let body: string;
    let templateRow: typeof templates.$inferSelect | null = null;
    let templateName: string | null = null;

    if (payload.type === 'text') {
      const window = windowState(conversation.lastInboundAt);
      if (!window.open) {
        throw unprocessable(
          'WINDOW_CLOSED',
          'La ventana de 24 horas está cerrada: solo puedes contactar con una plantilla aprobada',
        );
      }
      body = payload.body.trim();
      if (!body) throw badRequest('EMPTY_MESSAGE', 'El mensaje no puede estar vacío');
    } else {
      const [tpl] = await tx
        .select()
        .from(templates)
        .where(and(eq(templates.id, payload.template_id), eq(templates.inboxId, inbox.id)));
      if (!tpl) throw notFound('Plantilla no encontrada para esta bandeja');
      if (tpl.status !== 'approved') {
        throw unprocessable('TEMPLATE_NOT_APPROVED', 'Solo se pueden enviar plantillas aprobadas');
      }
      if (payload.variables.length !== tpl.variablesCount || payload.variables.some((v) => !v.trim())) {
        throw badRequest(
          'TEMPLATE_VARIABLES_MISSING',
          `La plantilla requiere ${tpl.variablesCount} variable(s) con valor`,
        );
      }
      body = renderTemplateBody(tpl.body, payload.variables);
      templateRow = tpl;
      templateName = tpl.name;
    }

    // Responder manualmente pausa la respuesta automática (FR-027)
    const updates: Partial<typeof conversations.$inferInsert> = {
      lastMessageAt: new Date(),
      lastMessagePreview: previewFor(payload.type === 'text' ? 'text' : 'template', body),
    };
    if (author.kind === 'user') {
      if (conversation.autoReply === 'active') updates.autoReply = 'paused';
      updates.needsHuman = false;
      updates.needsHumanReason = null;
    }
    await tx.update(conversations).set(updates).where(eq(conversations.id, conversationId));

    const [message] = await tx
      .insert(messages)
      .values({
        conversationId,
        direction: 'out',
        authorType: author.kind === 'user' ? 'user' : 'ai_agent',
        authorUserId: author.kind === 'user' ? author.userId : null,
        authorAgentId: author.kind === 'ai_agent' ? author.agentId : null,
        type: payload.type === 'text' ? 'text' : 'template',
        body,
        templateId: templateRow?.id ?? null,
        status: 'pending',
      })
      .returning();

    return { message: message!, conversation, contact, inbox, body, templateName, templateRow };
  });

  // Envío al canal fuera de la transacción
  const { message, contact, inbox, body, templateName, templateRow } = prepared;
  const token = config.SIMULATION_MODE ? '' : inbox.accessTokenEnc ? decryptSecret(inbox.accessTokenEnc) : '';
  let finalMessage = message;
  try {
    const client = getGraphClient();
    const result =
      payload.type === 'text'
        ? await client.sendText(token, inbox.phoneNumberId!, contact.waId, body)
        : await client.sendTemplate(
            token,
            inbox.phoneNumberId!,
            contact.waId,
            templateName!,
            templateRow!.language,
            payload.variables.length > 0
              ? [{ type: 'body', parameters: payload.variables.map((v) => ({ type: 'text', text: v })) }]
              : [],
          );
    const updated = await db
      .update(messages)
      .set({ wamid: result.wamid || null, status: 'sent' })
      .where(eq(messages.id, message.id))
      .returning();
    finalMessage = updated[0]!;
  } catch (err) {
    const reason =
      err instanceof GraphApiError ? err.message : 'No se pudo entregar el mensaje al canal';
    const updated = await db
      .update(messages)
      .set({ status: 'failed', failureReason: reason })
      .where(eq(messages.id, message.id))
      .returning();
    finalMessage = updated[0]!;
  }

  const serialized = serializeMessage(finalMessage, author.name);
  const summary = await serializeConversation(conversationId);
  broadcast('message:new', { message: serialized, conversation: summary });
  broadcast('conversation:updated', summary);
  emitEvent('message:created', {
    messageId: finalMessage.id,
    conversationId,
    direction: 'out',
    body: finalMessage.body,
  });
  return serialized;
}
