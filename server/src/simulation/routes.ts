import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { loadUser } from '../auth/guards.js';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { inboxes, templates } from '../db/schema.js';
import { badRequest, notFound, unauthorized } from '../lib/errors.js';
import { processWebhookPayload } from '../modules/messages/ingest.js';
import { provisionInbox } from '../modules/inboxes/provisioning.js';
import type { WebhookPayload } from '../integrations/whatsapp/types.js';

/** Acceso: sesión admin O Bearer PROVISIONING_SECRET (para curl/CI). */
async function requireSimAccess(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const a = Buffer.from(header.slice(7));
    const b = Buffer.from(config.PROVISIONING_SECRET);
    if (a.length === b.length && timingSafeEqual(a, b)) return;
  }
  await loadUser(request);
  if (request.currentUser?.role === 'admin') return;
  throw unauthorized('Simulación: requiere sesión admin o bearer secret');
}

function incomingPayload(opts: {
  phoneNumberId: string;
  from: string;
  name: string;
  type: 'text' | 'image' | 'audio' | 'document';
  body: string | null;
  timestamp: Date;
  wamid?: string;
}): WebhookPayload {
  const wamid = opts.wamid ?? `wamid.SIM-IN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const base: Record<string, unknown> = {
    from: opts.from,
    id: wamid,
    timestamp: String(Math.floor(opts.timestamp.getTime() / 1000)),
    type: opts.type,
  };
  if (opts.type === 'text') {
    base.text = { body: opts.body ?? '' };
  } else if (opts.type === 'image') {
    base.image = { id: 'SIM-MEDIA-image-1', mime_type: 'image/png', caption: opts.body ?? undefined };
  } else if (opts.type === 'audio') {
    base.audio = { id: 'SIM-MEDIA-audio-1', mime_type: 'audio/ogg' };
  } else {
    base.document = {
      id: 'SIM-MEDIA-document-1',
      mime_type: 'application/pdf',
      filename: 'documento-simulado.pdf',
      caption: opts.body ?? undefined,
    };
  }
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
              metadata: { display_phone_number: 'SIM', phone_number_id: opts.phoneNumberId },
              contacts: [{ profile: { name: opts.name }, wa_id: opts.from }],
              messages: [base as never],
            },
          },
        ],
      },
    ],
  };
}

export function simulationRoutes(app: FastifyInstance) {
  if (!config.SIMULATION_MODE) return; // 404 en producción real

  app.post('/api/simulate/webhook', { preHandler: requireSimAccess }, async (request) => {
    const payload = request.body as WebhookPayload;
    if (!payload || payload.object !== 'whatsapp_business_account') {
      throw badRequest('INVALID_PAYLOAD', 'El payload debe tener la estructura del webhook de Meta');
    }
    await processWebhookPayload(payload, 'simulation');
    return { ok: true };
  });

  app.post('/api/simulate/provisioning', { preHandler: requireSimAccess }, async (request) => {
    const body = z
      .object({
        phone_number_id: z.string().default('SIM-PNID-1'),
        display_phone_number: z.string().default('+52 1 55 0000 0001'),
        business_name: z.string().default('Bandeja Simulada'),
      })
      .parse(request.body ?? {});
    const inbox = await provisionInbox({
      waba_id: 'SIM-WABA',
      phone_number_id: body.phone_number_id,
      display_phone_number: body.display_phone_number,
      access_token: 'SIM-TOKEN',
      business_name: body.business_name,
    });
    return { ok: true, inbox_id: inbox.id };
  });

  app.post('/api/simulate/incoming-message', { preHandler: requireSimAccess }, async (request) => {
    const body = z
      .object({
        inbox_id: z.number().int().positive(),
        from: z.string().min(5),
        name: z.string().default('Cliente Simulado'),
        type: z.enum(['text', 'image', 'audio', 'document']).default('text'),
        body: z.string().nullable().default(null),
        timestamp_offset_hours: z.number().min(-8760).max(0).default(0),
      })
      .parse(request.body);

    const [inbox] = await db.select().from(inboxes).where(eq(inboxes.id, body.inbox_id));
    if (!inbox?.phoneNumberId) throw notFound('Bandeja no encontrada o sin número');

    const payload = incomingPayload({
      phoneNumberId: inbox.phoneNumberId,
      from: body.from,
      name: body.name,
      type: body.type,
      body: body.body,
      timestamp: new Date(Date.now() + body.timestamp_offset_hours * 3600 * 1000),
    });
    await processWebhookPayload(payload, 'simulation');
    return { ok: true };
  });

  app.post('/api/simulate/status', { preHandler: requireSimAccess }, async (request) => {
    const body = z
      .object({
        wamid: z.string().min(1),
        status: z.enum(['sent', 'delivered', 'read', 'failed']),
        error_code: z.number().optional(),
      })
      .parse(request.body);

    const payload: WebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'SIM-WABA',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: 'SIM', phone_number_id: 'SIM-PNID-1' },
                statuses: [
                  {
                    id: body.wamid,
                    status: body.status,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    recipient_id: 'SIM',
                    ...(body.error_code ? { errors: [{ code: body.error_code }] } : {}),
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await processWebhookPayload(payload, 'simulation');
    return { ok: true };
  });

  app.post('/api/simulate/template-status', { preHandler: requireSimAccess }, async (request) => {
    const body = z
      .object({
        template_id: z.number().int().positive(),
        event: z.enum(['APPROVED', 'REJECTED', 'DISABLED']),
        reason: z.string().nullable().default(null),
      })
      .parse(request.body);

    const [tpl] = await db.select().from(templates).where(eq(templates.id, body.template_id));
    if (!tpl) throw notFound('Plantilla no encontrada');

    const payload: WebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'SIM-WABA',
          changes: [
            {
              field: 'message_template_status_update',
              value: {
                event: body.event,
                message_template_id: tpl.metaTemplateId ?? 'SIM-TPL-X',
                message_template_name: tpl.name,
                message_template_language: tpl.language,
                reason: body.reason,
              },
            },
          ],
        },
      ],
    };
    await processWebhookPayload(payload, 'simulation');
    return { ok: true };
  });
}
