import { and, desc, eq, sql, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../auth/guards.js';
import { db } from '../../db/client.js';
import {
  broadcastCampaigns,
  broadcastRecipients,
  contacts,
  conversations,
  stages,
  tags,
  templates,
  inboxes,
  contactTags,
} from '../../db/schema.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { broadcast } from '../../realtime/hub.js';

function serializeCampaign(c: typeof broadcastCampaigns.$inferSelect) {
  return {
    id: c.id,
    inbox_id: c.inboxId,
    name: c.name,
    template_id: c.templateId,
    status: c.status,
    scheduled_at: c.scheduledAt?.toISOString() ?? null,
    started_at: c.startedAt?.toISOString() ?? null,
    completed_at: c.completedAt?.toISOString() ?? null,
    total_recipients: c.totalRecipients,
    sent_count: c.sentCount,
    delivered_count: c.deliveredCount,
    read_count: c.readCount,
    failed_count: c.failedCount,
    replied_count: c.repliedCount,
    filter_stage_id: c.filterStageId,
    filter_tag_ids: c.filterTagIds,
    filter_min_score: c.filterMinScore,
    filter_max_score: c.filterMaxScore,
    filter_last_activity_days: c.filterLastActivityDays,
    created_by: c.createdBy,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

function serializeRecipient(r: typeof broadcastRecipients.$inferSelect) {
  return {
    id: r.id,
    campaign_id: r.campaignId,
    contact_id: r.contactId,
    conversation_id: r.conversationId,
    status: r.status,
    wamid: r.wamid,
    error_message: r.errorMessage,
    sent_at: r.sentAt?.toISOString() ?? null,
    delivered_at: r.deliveredAt?.toISOString() ?? null,
    read_at: r.readAt?.toISOString() ?? null,
    replied_at: r.repliedAt?.toISOString() ?? null,
    created_at: r.createdAt.toISOString(),
  };
}

export function broadcastRoutes(app: FastifyInstance) {
  // Listar campañas
  app.get('/api/broadcasts', { preHandler: requireAuth }, async (request) => {
    const q = z
      .object({
        inbox_id: z.coerce.number().optional(),
        status: z.string().optional(),
      })
      .parse(request.query);

    const conditions = [];
    if (q.inbox_id) conditions.push(eq(broadcastCampaigns.inboxId, q.inbox_id));
    if (q.status) conditions.push(eq(broadcastCampaigns.status, q.status as typeof broadcastCampaigns.$inferSelect.status));

    const rows = await db
      .select()
      .from(broadcastCampaigns)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(broadcastCampaigns.id));

    return { items: rows.map(serializeCampaign) };
  });

  // Crear campaña
  app.post('/api/broadcasts', { preHandler: requireAdmin }, async (request, reply) => {
    const body = z
      .object({
        inbox_id: z.number().int().positive(),
        name: z.string().min(1).max(255),
        template_id: z.number().int().positive(),
        filter_stage_id: z.number().int().positive().optional(),
        filter_tag_ids: z.array(z.number().int().positive()).optional(),
        filter_min_score: z.number().int().min(1).max(100).optional(),
        filter_max_score: z.number().int().min(1).max(100).optional(),
        filter_last_activity_days: z.number().int().positive().optional(),
      })
      .parse(request.body);

    // Verificar que la bandeja existe
    const [inbox] = await db.select().from(inboxes).where(eq(inboxes.id, body.inbox_id));
    if (!inbox) throw notFound('Bandeja no encontrada');

    // Verificar que la plantilla existe y está aprobada
    const [template] = await db.select().from(templates).where(eq(templates.id, body.template_id));
    if (!template) throw notFound('Plantilla no encontrada');
    if (template.status !== 'approved') {
      throw badRequest('TEMPLATE_NOT_APPROVED', 'La plantilla debe estar aprobada por Meta');
    }

    // Verificar etapa si se especifica
    if (body.filter_stage_id) {
      const [stage] = await db.select().from(stages).where(eq(stages.id, body.filter_stage_id));
      if (!stage) throw notFound('Etapa no encontrada');
    }

    // Contar destinatarios
    const recipientCount = await countRecipients(body);

    const [campaign] = await db
      .insert(broadcastCampaigns)
      .values({
        inboxId: body.inbox_id,
        name: body.name,
        templateId: body.template_id,
        filterStageId: body.filter_stage_id,
        filterTagIds: body.filter_tag_ids ?? [],
        filterMinScore: body.filter_min_score,
        filterMaxScore: body.filter_max_score,
        filterLastActivityDays: body.filter_last_activity_days,
        totalRecipients: recipientCount,
        createdBy: request.currentUser!.id,
      })
      .returning();

    reply.code(201);
    return serializeCampaign(campaign!);
  });

  // Detalle de campaña
  app.get('/api/broadcasts/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [campaign] = await db.select().from(broadcastCampaigns).where(eq(broadcastCampaigns.id, id));
    if (!campaign) throw notFound('Campaña no encontrada');
    return serializeCampaign(campaign);
  });

  // Pre-visualizar destinatarios
  app.post('/api/broadcasts/:id/preview', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [campaign] = await db.select().from(broadcastCampaigns).where(eq(broadcastCampaigns.id, id));
    if (!campaign) throw notFound('Campaña no encontrada');

    const recipients = await buildRecipientsList(campaign);
    return {
      total: recipients.length,
      recipients: recipients.slice(0, 50), // Preview de los primeros 50
    };
  });

  // Ejecutar envío inmediato
  app.post('/api/broadcasts/:id/send', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [campaign] = await db.select().from(broadcastCampaigns).where(eq(broadcastCampaigns.id, id));
    if (!campaign) throw notFound('Campaña no encontrada');
    if (campaign.status !== 'draft' && campaign.status !== 'failed') {
      throw badRequest('INVALID_STATUS', 'Solo se pueden enviar campañas en borrador o fallidas');
    }

    // Actualizar estado a sending
    await db
      .update(broadcastCampaigns)
      .set({ status: 'sending', startedAt: new Date() })
      .where(eq(broadcastCampaigns.id, id));

    broadcast('broadcast:status_changed', {
      campaign_id: id,
      status: 'sending',
    });

    // Ejecutar envío en background (no bloqueante)
    executeCampaign(campaign).catch((err) => {
      console.error(`Error ejecutando campaña ${id}:`, err);
    });

    return { ok: true, message: 'Campaña en envío' };
  });

  // Programar envío
  app.post('/api/broadcasts/:id/schedule', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const body = z
      .object({
        scheduled_at: z.string().datetime(),
      })
      .parse(request.body);

    const [campaign] = await db.select().from(broadcastCampaigns).where(eq(broadcastCampaigns.id, id));
    if (!campaign) throw notFound('Campaña no encontrada');
    if (campaign.status !== 'draft') {
      throw badRequest('INVALID_STATUS', 'Solo se pueden programar campañas en borrador');
    }

    const scheduledAt = new Date(body.scheduled_at);
    if (scheduledAt <= new Date()) {
      throw badRequest('INVALID_DATE', 'La fecha de programación debe ser en el futuro');
    }

    await db
      .update(broadcastCampaigns)
      .set({ status: 'scheduled', scheduledAt })
      .where(eq(broadcastCampaigns.id, id));

    broadcast('broadcast:status_changed', {
      campaign_id: id,
      status: 'scheduled',
      scheduled_at: body.scheduled_at,
    });

    return { ok: true, scheduled_at: body.scheduled_at };
  });

  // Cancelar campaña
  app.post('/api/broadcasts/:id/cancel', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [campaign] = await db.select().from(broadcastCampaigns).where(eq(broadcastCampaigns.id, id));
    if (!campaign) throw notFound('Campaña no encontrada');
    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      throw badRequest('INVALID_STATUS', 'No se puede cancelar una campaña completada o ya cancelada');
    }

    await db.update(broadcastCampaigns).set({ status: 'cancelled' }).where(eq(broadcastCampaigns.id, id));

    broadcast('broadcast:status_changed', {
      campaign_id: id,
      status: 'cancelled',
    });

    return { ok: true };
  });

  // Eliminar campaña
  app.delete('/api/broadcasts/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [campaign] = await db.select().from(broadcastCampaigns).where(eq(broadcastCampaigns.id, id));
    if (!campaign) throw notFound('Campaña no encontrada');
    if (campaign.status === 'sending') {
      throw badRequest('INVALID_STATUS', 'No se puede eliminar una campaña en envío');
    }

    await db.delete(broadcastCampaigns).where(eq(broadcastCampaigns.id, id));
    return { ok: true };
  });

  // Listar destinatarios de una campaña
  app.get('/api/broadcasts/:id/recipients', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const q = z
      .object({
        status: z.string().optional(),
        limit: z.coerce.number().int().positive().max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(request.query);

    const conditions = [eq(broadcastRecipients.campaignId, id)];
    if (q.status) conditions.push(eq(broadcastRecipients.status, q.status as typeof broadcastRecipients.$inferSelect.status));

    const rows = await db
      .select()
      .from(broadcastRecipients)
      .where(and(...conditions))
      .orderBy(desc(broadcastRecipients.id))
      .limit(q.limit)
      .offset(q.offset);

    return { items: rows.map(serializeRecipient) };
  });
}

// Funciones auxiliares para el servicio

async function countRecipients(params: {
  inbox_id: number;
  filter_stage_id?: number;
  filter_tag_ids?: number[];
  filter_min_score?: number;
  filter_max_score?: number;
  filter_last_activity_days?: number;
}): Promise<number> {
  const conditions = [eq(contacts.inboxId, params.inbox_id)];

  if (params.filter_stage_id) {
    conditions.push(eq(contacts.stageId, params.filter_stage_id));
  }

  if (params.filter_min_score) {
    conditions.push(sql`${contacts.leadScoring} >= ${params.filter_min_score}`);
  }

  if (params.filter_max_score) {
    conditions.push(sql`${contacts.leadScoring} <= ${params.filter_max_score}`);
  }

  if (params.filter_last_activity_days) {
    conditions.push(
      sql`${contacts.createdAt} >= NOW() - INTERVAL '${params.filter_last_activity_days} days'`
    );
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(...conditions));

  let count = result?.count ?? 0;

  // Filtro por tags (requiere join adicional)
  if (params.filter_tag_ids && params.filter_tag_ids.length > 0) {
    const contactsWithTags = await db
      .select({ contactId: contactTags.contactId })
      .from(contactTags)
      .where(
        and(
          inArray(contactTags.tagId, params.filter_tag_ids),
          inArray(
            contactTags.contactId,
            db.select({ id: contacts.id }).from(contacts).where(and(...conditions))
          )
        )
      )
      .groupBy(contactTags.contactId);

    count = contactsWithTags.length;
  }

  return count;
}

async function buildRecipientsList(campaign: typeof broadcastCampaigns.$inferSelect) {
  const conditions = [eq(contacts.inboxId, campaign.inboxId)];

  if (campaign.filterStageId) {
    conditions.push(eq(contacts.stageId, campaign.filterStageId));
  }

  if (campaign.filterMinScore) {
    conditions.push(sql`${contacts.leadScoring} >= ${campaign.filterMinScore}`);
  }

  if (campaign.filterMaxScore) {
    conditions.push(sql`${contacts.leadScoring} <= ${campaign.filterMaxScore}`);
  }

  if (campaign.filterLastActivityDays) {
    conditions.push(
      sql`${contacts.createdAt} >= NOW() - INTERVAL '${campaign.filterLastActivityDays} days'`
    );
  }

  let contactRows = await db
    .select({
      id: contacts.id,
      conversationId: conversations.id,
    })
    .from(contacts)
    .leftJoin(conversations, eq(conversations.contactId, contacts.id))
    .where(and(...conditions));

  // Filtro por tags
  if (campaign.filterTagIds && campaign.filterTagIds.length > 0) {
    const contactIds = contactRows.map((r) => r.id);
    if (contactIds.length > 0) {
      const taggedContacts = await db
        .select({ contactId: contactTags.contactId })
        .from(contactTags)
        .where(and(inArray(contactTags.tagId, campaign.filterTagIds), inArray(contactTags.contactId, contactIds)))
        .groupBy(contactTags.contactId);

      const taggedSet = new Set(taggedContacts.map((r) => r.contactId));
      contactRows = contactRows.filter((r) => taggedSet.has(r.id));
    } else {
      contactRows = [];
    }
  }

  return contactRows;
}

async function executeCampaign(campaign: typeof broadcastCampaigns.$inferSelect) {
  const recipients = await buildRecipientsList(campaign);

  // Insertar destinatarios en la tabla
  const recipientValues = recipients.map((r) => ({
    campaignId: campaign.id,
    contactId: r.id,
    conversationId: r.conversationId,
    status: 'pending' as const,
  }));

  if (recipientValues.length > 0) {
    await db.insert(broadcastRecipients).values(recipientValues);
  }

  // Aquí iría la lógica de envío real via WhatsApp API
  // Por ahora simulamos el envío
  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipientValues) {
    try {
      // Simular envío (en producción esto llamaría a la API de WhatsApp)
      await new Promise((resolve) => setTimeout(resolve, 100)); // Rate limiting simulado

      // Actualizar estado del destinatario
      await db
        .update(broadcastRecipients)
        .set({
          status: 'sent',
          sentAt: new Date(),
          wamid: `simulated_${Date.now()}_${recipient.contactId}`,
        })
        .where(
          and(
            eq(broadcastRecipients.campaignId, campaign.id),
            eq(broadcastRecipients.contactId, recipient.contactId)
          )
        );

      sentCount++;

      // Broadcast progreso
      broadcast('broadcast:recipient_update', {
        campaign_id: campaign.id,
        contact_id: recipient.contactId,
        status: 'sent',
      });
    } catch (error) {
      failedCount++;
      await db
        .update(broadcastRecipients)
        .set({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Error desconocido',
        })
        .where(
          and(
            eq(broadcastRecipients.campaignId, campaign.id),
            eq(broadcastRecipients.contactId, recipient.contactId)
          )
        );
    }
  }

  // Actualizar estadísticas de la campaña
  await db
    .update(broadcastCampaigns)
    .set({
      status: 'completed',
      completedAt: new Date(),
      sentCount,
      failedCount,
      deliveredCount: sentCount, // Simplificado
    })
    .where(eq(broadcastCampaigns.id, campaign.id));

  broadcast('broadcast:status_changed', {
    campaign_id: campaign.id,
    status: 'completed',
    stats: {
      sent: sentCount,
      failed: failedCount,
    },
  });
}
