import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { config, decryptSecret } from '../../config.js';
import { db } from '../../db/client.js';
import {
  contacts,
  conversations,
  inboxes,
  messages,
  templates,
  webhookEvents,
} from '../../db/schema.js';
import { getGraphClient, parseWebhook } from '../../integrations/whatsapp/index.js';
import type {
  InboundMessageEvent,
  StatusEvent,
  TemplateStatusEvent,
  WebhookPayload,
} from '../../integrations/whatsapp/types.js';
import { broadcast } from '../../realtime/hub.js';
import { triggerAutoReply } from '../agents/hook.js';
import { serializeConversation, defaultStageId } from '../conversations/serialize.js';
import { windowState } from '../conversations/window.js';
import { previewFor, serializeMessage } from './serialize.js';
import { emitEvent } from '../../lib/events.js';

const STATUS_RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 9 };

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'application/pdf': 'pdf',
};

async function logEvent(source: 'meta' | 'simulation', payload: unknown, status: 'processed' | 'discarded' | 'error', detail?: string) {
  try {
    await db.insert(webhookEvents).values({ source, payload: payload as object, status, detail });
  } catch {
    // el log de diagnóstico nunca debe tumbar la ingesta
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}

async function persistMedia(
  inboxId: number,
  accessTokenEnc: string | null,
  event: InboundMessageEvent,
): Promise<{ mediaPath: string | null; mediaMime: string | null; mediaFilename: string | null }> {
  const media = event.message.media;
  if (!media) return { mediaPath: null, mediaMime: null, mediaFilename: null };
  try {
    const token = config.SIMULATION_MODE ? '' : accessTokenEnc ? decryptSecret(accessTokenEnc) : '';
    const download = await getGraphClient().fetchMedia(token, media.id);
    const mime = media.mime ?? download.mime;
    const ext = EXT_BY_MIME[mime] ?? 'bin';
    const dir = path.join(config.uploadsDir, 'media', String(inboxId));
    mkdirSync(dir, { recursive: true });
    const fileName = `${sanitizeFilename(event.message.wamid)}.${ext}`;
    writeFileSync(path.join(dir, fileName), download.buffer);
    return {
      mediaPath: `media/${inboxId}/${fileName}`,
      mediaMime: mime,
      mediaFilename: media.filename ?? download.filename,
    };
  } catch {
    // Adjunto no disponible: el mensaje se conserva con placeholder (edge case spec)
    return { mediaPath: null, mediaMime: media.mime, mediaFilename: media.filename };
  }
}

async function handleInbound(event: InboundMessageEvent, source: 'meta' | 'simulation') {
  const [inbox] = await db.select().from(inboxes).where(eq(inboxes.phoneNumberId, event.phoneNumberId));
  if (!inbox || inbox.status === 'disconnected') {
    await logEvent(source, event, 'discarded', `phone_number_id desconocido o desconectado: ${event.phoneNumberId}`);
    return;
  }

  // Deduplicación por wamid (reintentos de Meta)
  const [existing] = await db.select({ id: messages.id }).from(messages).where(eq(messages.wamid, event.message.wamid));
  if (existing) {
    await logEvent(source, event, 'discarded', `wamid duplicado: ${event.message.wamid}`);
    return;
  }

  // Upsert de contacto (lead) — entra en la etapa 1 del embudo
  const stageId = await defaultStageId();
  const inserted = await db
    .insert(contacts)
    .values({
      inboxId: inbox.id,
      waId: event.contact.waId,
      name: event.contact.name,
      phone: event.contact.waId,
      stageId,
    })
    .onConflictDoUpdate({
      target: [contacts.inboxId, contacts.waId],
      set: event.contact.name ? { name: event.contact.name } : { waId: event.contact.waId },
    })
    .returning();
  const contact = inserted[0]!;

  // Upsert de conversación única por (inbox, contacto)
  let [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.inboxId, inbox.id), eq(conversations.contactId, contact.id)));
  if (!conversation) {
    const created = await db
      .insert(conversations)
      .values({ inboxId: inbox.id, contactId: contact.id })
      .onConflictDoNothing()
      .returning();
    conversation =
      created[0] ??
      (await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.inboxId, inbox.id), eq(conversations.contactId, contact.id))))[0]!;
  }

  const wasOpen = windowState(conversation.lastInboundAt).open;

  const mediaInfo = await persistMedia(inbox.id, inbox.accessTokenEnc, event);

  const [message] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      wamid: event.message.wamid,
      direction: 'in',
      authorType: 'contact',
      type: event.message.type,
      body: event.message.text,
      mediaPath: mediaInfo.mediaPath,
      mediaMime: mediaInfo.mediaMime,
      mediaFilename: mediaInfo.mediaFilename,
      channelTimestamp: event.message.timestamp,
    })
    .onConflictDoNothing()
    .returning();
  if (!message) {
    await logEvent(source, event, 'discarded', `wamid duplicado (carrera): ${event.message.wamid}`);
    return;
  }

  // La ventana solo avanza: un evento entrante viejo no la retrocede
  const newLastInbound =
    !conversation.lastInboundAt || event.message.timestamp > conversation.lastInboundAt
      ? event.message.timestamp
      : conversation.lastInboundAt;

  await db
    .update(conversations)
    .set({
      lastInboundAt: newLastInbound,
      lastMessageAt: new Date(),
      lastMessagePreview: previewFor(event.message.type, event.message.text),
      unreadCount: conversation.unreadCount + 1,
    })
    .where(eq(conversations.id, conversation.id));

  const summary = await serializeConversation(conversation.id);
  broadcast('message:new', { message: serializeMessage(message, contact.name), conversation: summary });
  broadcast('conversation:updated', summary);
  emitEvent('message:created', {
    messageId: message.id,
    conversationId: conversation.id,
    direction: 'in',
    body: message.body,
  });

  const isOpenNow = windowState(newLastInbound).open;
  if (!wasOpen && isOpenNow) {
    broadcast('window:reopened', { conversation_id: conversation.id, expiresAt: windowState(newLastInbound).expiresAt });
  }

  await logEvent(source, { wamid: event.message.wamid, phoneNumberId: event.phoneNumberId }, 'processed');

  // Dispara la respuesta automática (no bloqueante)
  triggerAutoReply(conversation.id);
}

async function handleStatus(event: StatusEvent, source: 'meta' | 'simulation') {
  const [message] = await db.select().from(messages).where(eq(messages.wamid, event.wamid));
  if (!message) {
    await logEvent(source, event, 'discarded', `status para wamid desconocido: ${event.wamid}`);
    return;
  }
  const currentRank = STATUS_RANK[message.status ?? 'pending'] ?? 0;
  const newRank = STATUS_RANK[event.status] ?? 0;
  if (newRank <= currentRank) return; // solo hacia delante

  await db
    .update(messages)
    .set({ status: event.status, failureReason: event.failureReason })
    .where(eq(messages.id, message.id));

  broadcast('message:status', {
    message_id: message.id,
    conversation_id: message.conversationId,
    status: event.status,
    failure_reason: event.failureReason,
  });
  await logEvent(source, { wamid: event.wamid, status: event.status }, 'processed');
}

const TEMPLATE_STATUS_MAP: Record<TemplateStatusEvent['event'], 'approved' | 'rejected' | 'disabled' | 'pending'> = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DISABLED: 'disabled',
  PENDING: 'pending',
};

async function handleTemplateStatus(event: TemplateStatusEvent, source: 'meta' | 'simulation') {
  const [template] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.name, event.templateName), eq(templates.language, event.language)));
  if (!template) {
    await logEvent(source, event, 'discarded', `plantilla desconocida: ${event.templateName}/${event.language}`);
    return;
  }
  const status = TEMPLATE_STATUS_MAP[event.event];
  await db
    .update(templates)
    .set({
      status,
      rejectionReason: event.reason,
      metaTemplateId: event.metaTemplateId || template.metaTemplateId,
      lastSyncedAt: new Date(),
    })
    .where(eq(templates.id, template.id));

  broadcast('template:status_changed', {
    template_id: template.id,
    inbox_id: template.inboxId,
    status,
    rejection_reason: event.reason,
  });
  await logEvent(source, { template: event.templateName, event: event.event }, 'processed');
}

/** Punto de entrada único: webhook real, simulación y eventos sintéticos del mock. */
export async function processWebhookPayload(payload: WebhookPayload, source: 'meta' | 'simulation') {
  const events = parseWebhook(payload);
  if (events.length === 0) {
    await logEvent(source, payload, 'discarded', 'payload sin eventos reconocibles');
    return;
  }
  for (const event of events) {
    try {
      if (event.kind === 'inbound_message') await handleInbound(event, source);
      else if (event.kind === 'status') await handleStatus(event, source);
      else await handleTemplateStatus(event, source);
    } catch (err) {
      await logEvent(source, event, 'error', err instanceof Error ? err.message : String(err));
    }
  }
}
