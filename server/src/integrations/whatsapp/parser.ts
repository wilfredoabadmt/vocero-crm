import type {
  DomainEvent,
  InboundMessage,
  MessagesValue,
  TemplateStatusValue,
  WebhookPayload,
} from './types.js';

const MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'] as const;

// Códigos de error de Meta con traducción útil para el asesor
const META_ERROR_MESSAGES: Record<number, string> = {
  131047: 'Fuera de la ventana de 24 horas: solo se puede contactar con una plantilla aprobada',
  131026: 'El destinatario no puede recibir este mensaje (número inválido o bloqueado)',
  131048: 'Límite de envíos alcanzado por calidad del número',
  132000: 'La cantidad de variables no coincide con la plantilla',
  132001: 'La plantilla no existe o no está aprobada para este idioma',
  470: 'Fuera de la ventana de 24 horas: solo se puede contactar con una plantilla aprobada',
};

export function describeMetaError(code: number | undefined, fallback?: string | null): string {
  if (code && META_ERROR_MESSAGES[code]) return META_ERROR_MESSAGES[code];
  return fallback || 'El canal rechazó el mensaje';
}

function epochToDate(epochSeconds: string): Date | null {
  const n = Number(epochSeconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000);
}

function parseInbound(value: MessagesValue, msg: InboundMessage): DomainEvent | null {
  const timestamp = epochToDate(msg.timestamp);
  if (!msg.id || !msg.from || !timestamp) return null;

  const profileName = value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;
  let type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'unsupported' = 'unsupported';
  let text: string | null = null;
  let media: { id: string; mime: string | null; filename: string | null; caption: string | null } | null = null;

  if (msg.type === 'text' && msg.text?.body) {
    type = 'text';
    text = msg.text.body;
  } else if ((MEDIA_TYPES as readonly string[]).includes(msg.type)) {
    const obj = msg[msg.type as (typeof MEDIA_TYPES)[number]];
    if (obj?.id) {
      type = msg.type as typeof type;
      media = {
        id: obj.id,
        mime: obj.mime_type ?? null,
        filename: 'filename' in obj ? ((obj as { filename?: string }).filename ?? null) : null,
        caption: obj.caption ?? null,
      };
      text = obj.caption ?? null;
    }
  }

  return {
    kind: 'inbound_message',
    phoneNumberId: value.metadata.phone_number_id,
    contact: { waId: msg.from, name: profileName },
    message: { wamid: msg.id, type, text, media, timestamp },
  };
}

/** Convierte un payload del webhook de Meta en eventos de dominio tipados. */
export function parseWebhook(payload: WebhookPayload): DomainEvent[] {
  const events: DomainEvent[] = [];
  if (payload.object !== 'whatsapp_business_account') return events;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === 'messages') {
        const value = change.value as MessagesValue;
        if (!value?.metadata?.phone_number_id) continue;

        for (const msg of value.messages ?? []) {
          const event = parseInbound(value, msg);
          if (event) events.push(event);
        }

        for (const st of value.statuses ?? []) {
          const timestamp = epochToDate(st.timestamp) ?? new Date();
          if (!st.id || !st.status) continue;
          events.push({
            kind: 'status',
            phoneNumberId: value.metadata.phone_number_id,
            wamid: st.id,
            status: st.status,
            timestamp,
            failureReason:
              st.status === 'failed' ? describeMetaError(st.errors?.[0]?.code, st.errors?.[0]?.message) : null,
          });
        }
      } else if (change.field === 'message_template_status_update') {
        const value = change.value as TemplateStatusValue;
        if (!value?.message_template_name) continue;
        events.push({
          kind: 'template_status',
          wabaId: entry.id,
          event: value.event,
          templateName: value.message_template_name,
          language: value.message_template_language,
          metaTemplateId: String(value.message_template_id ?? ''),
          reason: value.reason ?? null,
        });
      }
    }
  }
  return events;
}
