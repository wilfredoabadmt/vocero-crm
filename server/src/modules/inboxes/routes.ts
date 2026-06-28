import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../auth/guards.js';
import { db } from '../../db/client.js';
import { inboxes } from '../../db/schema.js';
import { notFound } from '../../lib/errors.js';
import { broadcast } from '../../realtime/hub.js';

// Base configurable; el parámetro `client` se rellena con el nombre de la bandeja
// para que el tech provider (n8n) identifique qué bandeja se está onboardeando.
const ONBOARDING_BASE_URL = process.env.ONBOARDING_BASE_URL ?? 'https://aishiagency.tech/embedded-whatsapp-coex';

function onboardingUrl(inboxName: string): string {
  return `${ONBOARDING_BASE_URL}?client=${encodeURIComponent(inboxName)}`;
}

function serializeInbox(i: typeof inboxes.$inferSelect) {
  return {
    id: i.id,
    name: i.name,
    status: i.status,
    display_phone_number: i.displayPhoneNumber,
    waba_id: i.wabaId,
    phone_number_id: i.phoneNumberId,
    last_error: i.lastError,
    connected_at: i.connectedAt?.toISOString() ?? null,
    created_at: i.createdAt.toISOString(),
  };
}

export function inboxRoutes(app: FastifyInstance) {
  app.get('/api/inboxes', { preHandler: requireAuth }, async () => {
    const rows = await db.select().from(inboxes).orderBy(desc(inboxes.id));
    return { items: rows.map(serializeInbox) };
  });

  app.post('/api/inboxes', { preHandler: requireAdmin }, async (request, reply) => {
    const { name } = z.object({ name: z.string().min(1).max(100) }).parse(request.body);
    const [inbox] = await db.insert(inboxes).values({ name, status: 'pending' }).returning();
    reply.code(201);
    return { ...serializeInbox(inbox!), onboarding_url: onboardingUrl(inbox!.name) };
  });

  app.patch('/api/inboxes/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const { name } = z.object({ name: z.string().min(1).max(100) }).parse(request.body);
    const [inbox] = await db.update(inboxes).set({ name }).where(eq(inboxes.id, id)).returning();
    if (!inbox) throw notFound('Bandeja no encontrada');
    return serializeInbox(inbox);
  });

  app.post('/api/inboxes/:id/disconnect', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const [inbox] = await db
      .update(inboxes)
      .set({ status: 'disconnected', accessTokenEnc: null, lastError: null })
      .where(eq(inboxes.id, id))
      .returning();
    if (!inbox) throw notFound('Bandeja no encontrada');
    broadcast('inbox:status_changed', { inbox_id: inbox.id, status: inbox.status, last_error: null });
    return serializeInbox(inbox);
  });

  app.post('/api/inboxes/:id/retry', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const [inbox] = await db
      .update(inboxes)
      .set({ status: 'pending', lastError: null })
      .where(eq(inboxes.id, id))
      .returning();
    if (!inbox) throw notFound('Bandeja no encontrada');
    broadcast('inbox:status_changed', { inbox_id: inbox.id, status: inbox.status, last_error: null });
    return { ...serializeInbox(inbox), onboarding_url: onboardingUrl(inbox.name) };
  });
}
