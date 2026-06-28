// Tipos del webhook de WhatsApp Cloud API (v23.0) — estructura real de Meta.

export interface WebhookPayload {
  object: string;
  entry?: WebhookEntry[];
}

export interface WebhookEntry {
  id: string; // WABA ID
  changes?: WebhookChange[];
}

export interface WebhookChange {
  field: string; // "messages" | "message_template_status_update" | ...
  value: MessagesValue | TemplateStatusValue;
}

export interface MessagesValue {
  messaging_product: 'whatsapp';
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: { profile: { name: string }; wa_id: string }[];
  messages?: InboundMessage[];
  statuses?: StatusUpdate[];
}

export interface InboundMessage {
  from: string;
  id: string; // wamid
  timestamp: string; // epoch segundos
  type: string;
  text?: { body: string };
  image?: MediaObject;
  video?: MediaObject;
  audio?: MediaObject;
  document?: MediaObject & { filename?: string };
  sticker?: MediaObject;
}

export interface MediaObject {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
}

export interface StatusUpdate {
  id: string; // wamid del mensaje saliente
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title?: string; message?: string; error_data?: { details?: string } }[];
}

export interface TemplateStatusValue {
  event: 'APPROVED' | 'REJECTED' | 'DISABLED' | 'PENDING';
  message_template_id: number | string;
  message_template_name: string;
  message_template_language: string;
  reason?: string | null;
}

// ---- Eventos de dominio (salida del parser) ----

export type DomainEvent = InboundMessageEvent | StatusEvent | TemplateStatusEvent;

export interface InboundMessageEvent {
  kind: 'inbound_message';
  phoneNumberId: string;
  contact: { waId: string; name: string | null };
  message: {
    wamid: string;
    type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'unsupported';
    text: string | null;
    media: { id: string; mime: string | null; filename: string | null; caption: string | null } | null;
    timestamp: Date;
  };
}

export interface StatusEvent {
  kind: 'status';
  phoneNumberId: string;
  wamid: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  failureReason: string | null;
}

export interface TemplateStatusEvent {
  kind: 'template_status';
  wabaId: string;
  event: 'APPROVED' | 'REJECTED' | 'DISABLED' | 'PENDING';
  templateName: string;
  language: string;
  metaTemplateId: string;
  reason: string | null;
}
