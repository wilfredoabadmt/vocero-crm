import type { messages } from '../../db/schema.js';

export type MessageRow = typeof messages.$inferSelect;

export function serializeMessage(m: MessageRow, authorName?: string | null) {
  return {
    id: m.id,
    conversation_id: m.conversationId,
    wamid: m.wamid,
    direction: m.direction,
    author_type: m.authorType,
    author_name: authorName ?? null,
    type: m.type,
    body: m.body,
    media_url: m.mediaPath ? `/api/uploads/${m.mediaPath}` : null,
    media_mime: m.mediaMime,
    media_filename: m.mediaFilename,
    template_id: m.templateId,
    status: m.status,
    failure_reason: m.failureReason,
    channel_timestamp: m.channelTimestamp?.toISOString() ?? null,
    created_at: m.createdAt.toISOString(),
  };
}

export type SerializedMessage = ReturnType<typeof serializeMessage>;

export function previewFor(type: MessageRow['type'], body: string | null): string {
  switch (type) {
    case 'text':
    case 'template':
      return (body ?? '').slice(0, 120);
    case 'image':
      return body ? `📷 ${body.slice(0, 100)}` : '📷 Imagen';
    case 'video':
      return body ? `🎬 ${body.slice(0, 100)}` : '🎬 Video';
    case 'audio':
      return '🎙️ Nota de voz';
    case 'document':
      return body ? `📄 ${body.slice(0, 100)}` : '📄 Documento';
    case 'sticker':
      return 'Sticker';
    default:
      return 'Mensaje no soportado';
  }
}
