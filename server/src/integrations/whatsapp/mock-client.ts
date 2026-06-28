import { setTimeout as delay } from 'node:timers/promises';
import type {
  CreateTemplateResult,
  GraphApiClient,
  MediaDownload,
  RemoteTemplate,
  SendResult,
  TemplateComponentPayload,
} from './graph-client.js';
import { newSimulatedWamid } from './graph-client.js';
import { dispatchWebhook } from './dispatcher.js';
import type { WebhookPayload } from './types.js';

// PNG 1x1 gris — placeholder de media simulada
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const PLACEHOLDER_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF',
);

function statusPayload(phoneNumberId: string, wamid: string, status: string, recipient: string): WebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'SIM-WABA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: 'SIM', phone_number_id: phoneNumberId },
              statuses: [
                {
                  id: wamid,
                  status: status as 'sent' | 'delivered' | 'read' | 'failed',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: recipient,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function templateStatusPayload(
  wabaId: string,
  name: string,
  language: string,
  metaId: string,
  event: 'APPROVED' | 'REJECTED',
  reason: string | null,
): WebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: wabaId,
        changes: [
          {
            field: 'message_template_status_update',
            value: {
              event,
              message_template_id: metaId,
              message_template_name: name,
              message_template_language: language,
              reason,
            },
          },
        ],
      },
    ],
  };
}

/**
 * Mock de Graph API para SIMULATION_MODE: no llama a Meta; genera wamids falsos
 * y reinyecta webhooks sintéticos (estados de entrega, aprobación de plantillas)
 * por el mismo pipeline real.
 */
export class SimulatedGraphClient implements GraphApiClient {
  private templates = new Map<string, RemoteTemplate>();
  private seq = 0;

  private scheduleStatuses(phoneNumberId: string, wamid: string, to: string) {
    void (async () => {
      await delay(500);
      await dispatchWebhook(statusPayload(phoneNumberId, wamid, 'sent', to), 'simulation').catch(() => {});
      await delay(1500);
      await dispatchWebhook(statusPayload(phoneNumberId, wamid, 'delivered', to), 'simulation').catch(() => {});
    })();
  }

  async sendText(_token: string, phoneNumberId: string, to: string, _body: string): Promise<SendResult> {
    const wamid = newSimulatedWamid();
    this.scheduleStatuses(phoneNumberId, wamid, to);
    return { wamid };
  }

  async sendTemplate(
    _token: string,
    phoneNumberId: string,
    to: string,
    _templateName: string,
    _language: string,
    _components: TemplateComponentPayload[],
  ): Promise<SendResult> {
    const wamid = newSimulatedWamid();
    this.scheduleStatuses(phoneNumberId, wamid, to);
    return { wamid };
  }

  async createTemplate(
    _token: string,
    wabaId: string,
    tpl: { name: string; language: string; category: string; body: string; exampleParams: string[] },
  ): Promise<CreateTemplateResult> {
    const metaId = `SIM-TPL-${++this.seq}`;
    this.templates.set(`${tpl.name}:${tpl.language}`, {
      id: metaId,
      name: tpl.name,
      language: tpl.language,
      status: 'PENDING',
      category: tpl.category,
    });
    const willReject = tpl.name.includes('_reject');
    void (async () => {
      await delay(5000);
      const remote = this.templates.get(`${tpl.name}:${tpl.language}`);
      if (remote) remote.status = willReject ? 'REJECTED' : 'APPROVED';
      await dispatchWebhook(
        templateStatusPayload(
          wabaId,
          tpl.name,
          tpl.language,
          metaId,
          willReject ? 'REJECTED' : 'APPROVED',
          willReject ? 'INVALID_FORMAT' : null,
        ),
        'simulation',
      ).catch(() => {});
    })();
    return { id: metaId, status: 'PENDING' };
  }

  async listTemplates(_token: string, _wabaId: string): Promise<RemoteTemplate[]> {
    return [...this.templates.values()];
  }

  async deleteTemplate(_token: string, _wabaId: string, name: string): Promise<void> {
    for (const key of this.templates.keys()) {
      if (key.startsWith(`${name}:`)) this.templates.delete(key);
    }
  }

  async fetchMedia(_token: string, mediaId: string): Promise<MediaDownload> {
    if (mediaId.includes('document') || mediaId.includes('pdf')) {
      return { buffer: PLACEHOLDER_PDF, mime: 'application/pdf', filename: 'documento-simulado.pdf' };
    }
    if (mediaId.includes('audio')) {
      return { buffer: Buffer.alloc(64), mime: 'audio/ogg', filename: null };
    }
    return { buffer: PLACEHOLDER_PNG, mime: 'image/png', filename: null };
  }
}
