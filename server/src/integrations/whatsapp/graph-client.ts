import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from '../../config.js';

export interface SendResult {
  wamid: string;
}

export interface CreateTemplateResult {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface RemoteTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  rejected_reason?: string;
}

export interface MediaDownload {
  buffer: Buffer;
  mime: string;
  filename: string | null;
}

export interface TemplateComponentPayload {
  type: 'body';
  parameters: { type: 'text'; text: string }[];
}

/** Contrato único hacia Meta Graph API — implementación real y mock de simulación. */
export interface GraphApiClient {
  sendText(token: string, phoneNumberId: string, to: string, body: string): Promise<SendResult>;
  sendTemplate(
    token: string,
    phoneNumberId: string,
    to: string,
    templateName: string,
    language: string,
    components: TemplateComponentPayload[],
  ): Promise<SendResult>;
  createTemplate(
    token: string,
    wabaId: string,
    tpl: { name: string; language: string; category: string; body: string; exampleParams: string[] },
  ): Promise<CreateTemplateResult>;
  listTemplates(token: string, wabaId: string): Promise<RemoteTemplate[]>;
  deleteTemplate(token: string, wabaId: string, name: string): Promise<void>;
  fetchMedia(token: string, mediaId: string): Promise<MediaDownload>;
}

const GRAPH_BASE = 'https://graph.facebook.com/v23.0';

export class GraphApiError extends Error {
  constructor(
    public code: number | undefined,
    message: string,
  ) {
    super(message);
  }
}

async function graphFetch(token: string, path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json as { error?: { code?: number; message?: string; error_user_msg?: string } }).error;
    throw new GraphApiError(err?.code, err?.error_user_msg || err?.message || `Graph API ${res.status}`);
  }
  return json;
}

export class RealGraphClient implements GraphApiClient {
  async sendText(token: string, phoneNumberId: string, to: string, body: string): Promise<SendResult> {
    const json = await graphFetch(token, `/${phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: true, body },
      }),
    });
    return { wamid: (json as { messages?: { id: string }[] }).messages?.[0]?.id ?? '' };
  }

  async sendTemplate(
    token: string,
    phoneNumberId: string,
    to: string,
    templateName: string,
    language: string,
    components: TemplateComponentPayload[],
  ): Promise<SendResult> {
    const json = await graphFetch(token, `/${phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: templateName, language: { code: language }, components },
      }),
    });
    return { wamid: (json as { messages?: { id: string }[] }).messages?.[0]?.id ?? '' };
  }

  async createTemplate(
    token: string,
    wabaId: string,
    tpl: { name: string; language: string; category: string; body: string; exampleParams: string[] },
  ): Promise<CreateTemplateResult> {
    const components: Record<string, unknown>[] = [
      {
        type: 'BODY',
        text: tpl.body,
        ...(tpl.exampleParams.length > 0 ? { example: { body_text: [tpl.exampleParams] } } : {}),
      },
    ];
    const json = await graphFetch(token, `/${wabaId}/message_templates`, {
      method: 'POST',
      body: JSON.stringify({ name: tpl.name, language: tpl.language, category: tpl.category, components }),
    });
    return {
      id: String(json.id ?? ''),
      status: ((json.status as string) ?? 'PENDING') as CreateTemplateResult['status'],
    };
  }

  async listTemplates(token: string, wabaId: string): Promise<RemoteTemplate[]> {
    const json = await graphFetch(
      token,
      `/${wabaId}/message_templates?fields=id,name,status,language,category,rejected_reason&limit=100`,
    );
    return ((json.data as RemoteTemplate[]) ?? []).map((t) => ({ ...t, id: String(t.id) }));
  }

  async deleteTemplate(token: string, wabaId: string, name: string): Promise<void> {
    await graphFetch(token, `/${wabaId}/message_templates?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
  }

  async fetchMedia(token: string, mediaId: string): Promise<MediaDownload> {
    const meta = await graphFetch(token, `/${mediaId}`);
    const url = meta.url as string;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new GraphApiError(res.status, 'No se pudo descargar el adjunto de Meta');
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      mime: (meta.mime_type as string) ?? res.headers.get('content-type') ?? 'application/octet-stream',
      filename: null,
    };
  }
}

/** Verificación de firma X-Hub-Signature-256 del webhook (body crudo). */
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!config.META_APP_SECRET) return false;
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', config.META_APP_SECRET).update(rawBody).digest('hex');
  const received = signatureHeader.slice('sha256='.length);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
}

export const newSimulatedWamid = () => `wamid.SIM-${randomUUID()}`;
