import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { authRoutes } from './auth/routes.js';
import { config } from './config.js';
import { db } from './db/client.js';
import { sql } from 'drizzle-orm';
import { registerWebhookDispatcher } from './integrations/whatsapp/index.js';
import { AppError } from './lib/errors.js';
import { initAutoReply } from './modules/agents/autoreply.js';
import { initWorkflows } from './modules/workflows/engine.js';
import { initLeadScoring } from './modules/agents/leadscoring.js';
import { agentRoutes } from './modules/agents/routes.js';
import { contactRoutes } from './modules/contacts/routes.js';
import { conversationRoutes } from './modules/conversations/routes.js';
import { inboxRoutes } from './modules/inboxes/routes.js';
import { provisioningRoutes } from './modules/inboxes/provisioning.js';
import { webhookRoutes } from './modules/inboxes/webhook.js';
import { processWebhookPayload } from './modules/messages/ingest.js';
import { noteRoutes } from './modules/notes/routes.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { templateRoutes } from './modules/templates/routes.js';
import { uploadRoutes } from './modules/uploads/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { registerRealtime } from './realtime/hub.js';
import { simulationRoutes } from './simulation/routes.js';
import { analyticsRoutes } from './modules/analytics/routes.js';
import { workflowRoutes } from './modules/workflows/routes.js';
import { stripeRoutes } from './integrations/stripe.js';
import { broadcastRoutes } from './modules/broadcasts/routes.js';
import { assignmentRoutes } from './modules/assignments/routes.js';
import { taskRoutes } from './modules/tasks/routes.js';
import { alertRoutes } from './modules/alerts/routes.js';
import { exportRoutes } from './modules/exports/routes.js';
import { landingPageRoutes } from './modules/landing-pages/routes.js';
import { oauthRoutes } from './modules/oauth/routes.js';
import { detectAndScheduleAppointment } from './integrations/calendar.js';
import { onEvent } from './lib/events.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.NODE_ENV === 'test' ? 'warn' : 'info' },
    trustProxy: true, // detrás del proxy de Coolify
    bodyLimit: 12 * 1024 * 1024,
  });

  await app.register(fastifyCookie);
  await app.register(fastifyWebsocket);
  await app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

  // Conexiones de dominio
  registerWebhookDispatcher(processWebhookPayload);
  initAutoReply();
  initWorkflows();
  initLeadScoring();
  onEvent('message:created', (payload) => {
    void detectAndScheduleAppointment(payload.conversationId, payload.body);
  });

  // Manejador global de errores: { error: { code, message } }
  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof ZodError) {
      const first = err.errors[0];
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: first ? `${first.path.join('.')}: ${first.message}` : 'Datos inválidos',
        },
      });
    }
    const fastifyErr = err as { statusCode?: number; code?: string; message?: string };
    if (typeof fastifyErr.statusCode === 'number' && fastifyErr.statusCode < 500) {
      return reply.code(fastifyErr.statusCode).send({
        error: { code: fastifyErr.code ?? 'REQUEST_ERROR', message: fastifyErr.message ?? 'Solicitud inválida' },
      });
    }
    app.log.error(err);
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Error interno del servidor' } });
  });

  app.get('/api/health', async () => {
    let dbOk = true;
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbOk = false;
    }
    return { ok: dbOk, db: dbOk, simulation: config.SIMULATION_MODE };
  });

  // Seguridad básica de cabeceras
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
  });

  registerRealtime(app);
  authRoutes(app);
  conversationRoutes(app);
  noteRoutes(app);
  contactRoutes(app);
  inboxRoutes(app);
  provisioningRoutes(app);
  webhookRoutes(app);
  templateRoutes(app);
  agentRoutes(app);
  settingsRoutes(app);
  userRoutes(app);
  uploadRoutes(app);
  simulationRoutes(app);
  analyticsRoutes(app);
  workflowRoutes(app);
  stripeRoutes(app);
  broadcastRoutes(app);
  assignmentRoutes(app);
  taskRoutes(app);
  alertRoutes(app);
  exportRoutes(app);
  landingPageRoutes(app);
  oauthRoutes(app);

  // Frontend compilado (producción): web/dist servido por el mismo proceso
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/' });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws')) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } });
      }
      return reply.sendFile('index.html'); // SPA fallback
    });
  }

  return app;
}
