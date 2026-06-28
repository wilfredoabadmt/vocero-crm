import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { db } from '../../db/client.js';
import { webhookEvents } from '../../db/schema.js';
import { verifyWebhookSignature } from '../../integrations/whatsapp/index.js';
import type { WebhookPayload } from '../../integrations/whatsapp/types.js';
import { processWebhookPayload } from '../messages/ingest.js';

export function webhookRoutes(app: FastifyInstance) {
  // Scope aislado: aquí el body JSON se conserva como Buffer crudo para verificar la firma HMAC
  app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

    // Handshake de verificación de Meta
    scope.get('/api/webhooks/whatsapp', async (request, reply) => {
      const q = z
        .object({
          'hub.mode': z.string().optional(),
          'hub.verify_token': z.string().optional(),
          'hub.challenge': z.string().optional(),
        })
        .parse(request.query);
      if (q['hub.mode'] === 'subscribe' && config.WEBHOOK_VERIFY_TOKEN && q['hub.verify_token'] === config.WEBHOOK_VERIFY_TOKEN) {
        return reply.type('text/plain').send(q['hub.challenge'] ?? '');
      }
      return reply.code(403).send('Forbidden');
    });

    scope.post('/api/webhooks/whatsapp', async (request, reply) => {
      const raw = request.body as Buffer;
      if (!verifyWebhookSignature(raw, request.headers['x-hub-signature-256'] as string | undefined)) {
        await db
          .insert(webhookEvents)
          .values({ source: 'meta', status: 'error', detail: 'Firma X-Hub-Signature-256 inválida' })
          .catch(() => {});
        return reply.code(401).send({ error: 'invalid signature' });
      }

      let payload: WebhookPayload;
      try {
        payload = JSON.parse(raw.toString('utf8')) as WebhookPayload;
      } catch {
        return reply.code(400).send({ error: 'invalid json' });
      }

      // 200 inmediato; procesamiento fuera del ciclo de respuesta (los reintentos de Meta son inocuos por dedup)
      setImmediate(() => {
        void processWebhookPayload(payload, 'meta').catch((err) => app.log.error(err, 'webhook processing failed'));
      });
      return reply.send({});
    });
  });
}
