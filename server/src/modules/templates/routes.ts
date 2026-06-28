import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../auth/guards.js';
import { config, decryptSecret } from '../../config.js';
import { db } from '../../db/client.js';
import { conversations, inboxes, templates } from '../../db/schema.js';
import { GraphApiError, getGraphClient } from '../../integrations/whatsapp/index.js';
import { badRequest, notFound, unprocessable } from '../../lib/errors.js';
import { broadcast } from '../../realtime/hub.js';

/** Valida que las variables sean {{1}}..{{n}} consecutivas y devuelve n. */
export function countTemplateVariables(body: string): number {
  const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  if (matches.length === 0) return 0;
  const unique = [...new Set(matches)].sort((a, b) => a - b);
  for (let i = 0; i < unique.length; i++) {
    if (unique[i] !== i + 1) {
      throw badRequest('INVALID_VARIABLES', 'Las variables deben ser {{1}}, {{2}}… consecutivas desde 1');
    }
  }
  return unique.length;
}

function serializeTemplate(t: typeof templates.$inferSelect) {
  return {
    id: t.id,
    inbox_id: t.inboxId,
    name: t.name,
    language: t.language,
    category: t.category,
    body: t.body,
    variables_count: t.variablesCount,
    status: t.status,
    rejection_reason: t.rejectionReason,
    last_synced_at: t.lastSyncedAt?.toISOString() ?? null,
    created_at: t.createdAt.toISOString(),
  };
}

async function inboxToken(inbox: typeof inboxes.$inferSelect): Promise<string> {
  if (config.SIMULATION_MODE) return '';
  if (!inbox.accessTokenEnc) throw unprocessable('INBOX_NOT_CONNECTED', 'La bandeja no tiene credenciales');
  return decryptSecret(inbox.accessTokenEnc);
}

export function templateRoutes(app: FastifyInstance) {
  app.get('/api/templates', { preHandler: requireAuth }, async (request) => {
    const q = z
      .object({ inbox_id: z.coerce.number().optional(), status: z.string().optional() })
      .parse(request.query);
    const conditions = [];
    if (q.inbox_id) conditions.push(eq(templates.inboxId, q.inbox_id));
    if (q.status) conditions.push(eq(templates.status, q.status as typeof templates.$inferSelect.status));
    const rows = await db
      .select()
      .from(templates)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(templates.id));
    return { items: rows.map(serializeTemplate) };
  });

  app.get('/api/templates/selectable', { preHandler: requireAuth }, async (request) => {
    const { conversation_id } = z.object({ conversation_id: z.coerce.number() }).parse(request.query);
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversation_id));
    if (!conv) throw notFound('Conversación no encontrada');
    const rows = await db
      .select()
      .from(templates)
      .where(and(eq(templates.inboxId, conv.inboxId), eq(templates.status, 'approved')))
      .orderBy(templates.name);
    return { items: rows.map(serializeTemplate) };
  });

  app.post('/api/templates', { preHandler: requireAdmin }, async (request, reply) => {
    const body = z
      .object({
        inbox_id: z.number().int().positive(),
        name: z
          .string()
          .min(1)
          .max(512)
          .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guiones bajos'),
        language: z.string().min(2).max(10).default('es'),
        category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).default('UTILITY'),
        body: z.string().min(1).max(1024),
        example_params: z.array(z.string()).default([]),
      })
      .parse(request.body);

    const [inbox] = await db.select().from(inboxes).where(eq(inboxes.id, body.inbox_id));
    if (!inbox || inbox.status !== 'connected') {
      throw unprocessable('INBOX_NOT_CONNECTED', 'La bandeja debe estar conectada para crear plantillas');
    }

    const variablesCount = countTemplateVariables(body.body);
    const exampleParams =
      body.example_params.length === variablesCount
        ? body.example_params
        : Array.from({ length: variablesCount }, (_, i) => `Ejemplo ${i + 1}`);

    const [duplicate] = await db
      .select()
      .from(templates)
      .where(
        and(eq(templates.inboxId, body.inbox_id), eq(templates.name, body.name), eq(templates.language, body.language)),
      );
    if (duplicate) throw badRequest('TEMPLATE_EXISTS', 'Ya existe una plantilla con ese nombre e idioma');

    // Crear en Meta primero; solo persistimos si Meta acepta la solicitud
    let metaId: string;
    try {
      const result = await getGraphClient().createTemplate(await inboxToken(inbox), inbox.wabaId ?? '', {
        name: body.name,
        language: body.language,
        category: body.category,
        body: body.body,
        exampleParams,
      });
      metaId = result.id;
    } catch (err) {
      const msg = err instanceof GraphApiError ? err.message : 'Meta rechazó la creación de la plantilla';
      throw unprocessable('META_REJECTED', msg);
    }

    const [tpl] = await db
      .insert(templates)
      .values({
        inboxId: body.inbox_id,
        metaTemplateId: metaId,
        name: body.name,
        language: body.language,
        category: body.category,
        body: body.body,
        variablesCount,
        status: 'pending',
      })
      .returning();

    broadcast('template:status_changed', {
      template_id: tpl!.id,
      inbox_id: tpl!.inboxId,
      status: 'pending',
      rejection_reason: null,
    });
    reply.code(201);
    return serializeTemplate(tpl!);
  });

  app.post('/api/templates/:id/sync', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [tpl] = await db.select().from(templates).where(eq(templates.id, id));
    if (!tpl) throw notFound('Plantilla no encontrada');
    const [inbox] = await db.select().from(inboxes).where(eq(inboxes.id, tpl.inboxId));
    if (!inbox) throw notFound('Bandeja no encontrada');

    const remote = await getGraphClient().listTemplates(await inboxToken(inbox), inbox.wabaId ?? '');
    const match = remote.find((r) => r.name === tpl.name && r.language === tpl.language);
    if (match) {
      const statusMap: Record<string, typeof tpl.status> = {
        APPROVED: 'approved',
        REJECTED: 'rejected',
        PENDING: 'pending',
        DISABLED: 'disabled',
        PAUSED: 'disabled',
      };
      const newStatus = statusMap[match.status.toUpperCase()] ?? tpl.status;
      const [updated] = await db
        .update(templates)
        .set({
          status: newStatus,
          rejectionReason: match.rejected_reason ?? null,
          metaTemplateId: match.id,
          lastSyncedAt: new Date(),
        })
        .where(eq(templates.id, id))
        .returning();
      broadcast('template:status_changed', {
        template_id: id,
        inbox_id: tpl.inboxId,
        status: newStatus,
        rejection_reason: match.rejected_reason ?? null,
      });
      return serializeTemplate(updated!);
    }
    return serializeTemplate(tpl);
  });

  app.delete('/api/templates/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [tpl] = await db.select().from(templates).where(eq(templates.id, id));
    if (!tpl) throw notFound('Plantilla no encontrada');
    const [inbox] = await db.select().from(inboxes).where(eq(inboxes.id, tpl.inboxId));
    if (inbox) {
      try {
        await getGraphClient().deleteTemplate(await inboxToken(inbox), inbox.wabaId ?? '', tpl.name);
      } catch {
        // si Meta ya no la tiene, el borrado local procede igual
      }
    }
    await db.delete(templates).where(eq(templates.id, id));
    return { ok: true };
  });
}
