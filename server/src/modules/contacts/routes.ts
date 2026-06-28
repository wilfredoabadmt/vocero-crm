import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuth, requireAuthUser } from '../../auth/guards.js';
import { db } from '../../db/client.js';
import { contactTags, contacts, conversations, stages, tags, messages } from '../../db/schema.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { broadcast } from '../../realtime/hub.js';
import { serializeConversation } from '../conversations/serialize.js';
import { emitEvent } from '../../lib/events.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

async function contactTagList(contactId: number) {
  return db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(contactTags)
    .innerJoin(tags, eq(contactTags.tagId, tags.id))
    .where(eq(contactTags.contactId, contactId));
}

export function contactRoutes(app: FastifyInstance) {
  app.get('/api/contacts/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = idParam.parse(request.params);
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    if (!contact) throw notFound('Lead no encontrado');
    const convs = await db
      .select({ id: conversations.id, inboxId: conversations.inboxId })
      .from(conversations)
      .where(eq(conversations.contactId, id));
    return {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      wa_id: contact.waId,
      stage_id: contact.stageId,
      created_at: contact.createdAt.toISOString(),
      tags: await contactTagList(id),
      conversations: convs.map((c) => ({ id: c.id, inbox_id: c.inboxId })),
    };
  });

  app.patch('/api/contacts/:id', { preHandler: requireAuth }, async (request) => {
    const me = requireAuthUser(request);
    const { id } = idParam.parse(request.params);
    const body = z
      .object({ name: z.string().min(1).max(150).optional(), stage_id: z.number().int().positive().optional() })
      .parse(request.body);

    const [existingContact] = await db.select().from(contacts).where(eq(contacts.id, id));
    if (!existingContact) throw notFound('Lead no encontrado');
    const fromStageId = existingContact.stageId;

    const updates: Record<string, unknown> = {};
    if (body.name) updates.name = body.name;
    if (body.stage_id) {
      const [stage] = await db.select().from(stages).where(eq(stages.id, body.stage_id));
      if (!stage) throw badRequest('INVALID_STAGE', 'Etapa inexistente');
      updates.stageId = body.stage_id;
      updates.stageChangedAt = new Date();
    }
    const [contact] = await db.update(contacts).set(updates).where(eq(contacts.id, id)).returning();
    if (!contact) throw notFound('Lead no encontrado');

    if (body.stage_id) {
      broadcast('lead:stage_changed', { contact_id: id, stage_id: body.stage_id, by_user_id: me.id });
      if (fromStageId !== body.stage_id) {
        emitEvent('lead:stage_changed', { contactId: id, fromStageId, toStageId: body.stage_id });
      }
    }
    // La lista de conversaciones muestra nombre/etapa ⇒ refrescar
    const convs = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.contactId, id));
    for (const c of convs) {
      const summary = await serializeConversation(c.id);
      if (summary) broadcast('conversation:updated', summary);
    }
    return { ok: true, stage_id: contact.stageId, name: contact.name };
  });

  app.put('/api/contacts/:id/tags', { preHandler: requireAuth }, async (request) => {
    const { id } = idParam.parse(request.params);
    const { tag_ids } = z.object({ tag_ids: z.array(z.number().int().positive()) }).parse(request.body);
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    if (!contact) throw notFound('Lead no encontrado');
    if (tag_ids.length > 0) {
      const valid = await db.select({ id: tags.id }).from(tags).where(inArray(tags.id, tag_ids));
      if (valid.length !== tag_ids.length) throw badRequest('INVALID_TAG', 'Alguna etiqueta no existe');
    }
    await db.delete(contactTags).where(eq(contactTags.contactId, id));
    if (tag_ids.length > 0) {
      await db.insert(contactTags).values(tag_ids.map((tagId) => ({ contactId: id, tagId })));
    }
    const convs = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.contactId, id));
    for (const c of convs) {
      const summary = await serializeConversation(c.id);
      if (summary) broadcast('conversation:updated', summary);
    }
    return { tags: await contactTagList(id) };
  });

  // ---- Etiquetas ----
  app.get('/api/tags', { preHandler: requireAuth }, async () => {
    return { items: await db.select().from(tags).orderBy(tags.name) };
  });

  app.post('/api/tags', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({ name: z.string().min(1).max(50), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })
      .parse(request.body);
    const [existing] = await db.select().from(tags).where(eq(tags.name, body.name));
    if (existing) throw badRequest('TAG_EXISTS', 'Ya existe una etiqueta con ese nombre');
    const [tag] = await db.insert(tags).values(body).returning();
    reply.code(201);
    return tag;
  });

  app.patch('/api/tags/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = idParam.parse(request.params);
    const body = z
      .object({ name: z.string().min(1).max(50).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() })
      .parse(request.body);
    const [tag] = await db.update(tags).set(body).where(eq(tags.id, id)).returning();
    if (!tag) throw notFound('Etiqueta no encontrada');
    return tag;
  });

  app.delete('/api/tags/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = idParam.parse(request.params);
    await db.delete(tags).where(eq(tags.id, id));
    return { ok: true };
  });

  // ---- Kanban ----
  app.get('/api/kanban', { preHandler: requireAuth }, async () => {
    const stageRows = await db.select().from(stages).orderBy(stages.position);
    const leadRows = await db
      .select({
        contact: contacts,
        conversationId: conversations.id,
        preview: conversations.lastMessagePreview,
        lastMessageAt: conversations.lastMessageAt,
      })
      .from(contacts)
      .leftJoin(conversations, eq(conversations.contactId, contacts.id))
      .orderBy(desc(contacts.id));

    const contactIds = [...new Set(leadRows.map((r) => r.contact.id))];
    const tagRows = contactIds.length
      ? await db
          .select({ contactId: contactTags.contactId, id: tags.id, name: tags.name, color: tags.color })
          .from(contactTags)
          .innerJoin(tags, eq(contactTags.tagId, tags.id))
          .where(inArray(contactTags.contactId, contactIds))
      : [];

    const seen = new Set<number>();
    const leads = leadRows
      .filter((r) => {
        if (seen.has(r.contact.id)) return false;
        seen.add(r.contact.id);
        return true;
      })
      .map((r) => ({
        contact_id: r.contact.id,
        name: r.contact.name ?? r.contact.waId,
        phone: r.contact.phone,
        stage_id: r.contact.stageId,
        conversation_id: r.conversationId,
        last_message_preview: r.preview,
        last_message_at: r.lastMessageAt?.toISOString() ?? null,
        tags: tagRows.filter((t) => t.contactId === r.contact.id).map(({ id, name, color }) => ({ id, name, color })),
        lead_scoring: r.contact.leadScoring,
      }));

    return {
      columns: stageRows.map((s) => ({
        stage: { id: s.id, name: s.name, position: s.position },
        leads: leads.filter((l) => l.stage_id === s.id),
      })),
    };
  });

  // ---- Etapas (solo renombrar, FR-019) ----
  app.put('/api/stages/reorder', { preHandler: requireAdmin }, async (request) => {
    const { ids } = z.object({ ids: z.array(z.number().int().positive()) }).parse(request.body);

    await db.transaction(async (tx) => {
      // 1. Asignar posiciones negativas temporales para evitar violar la restricción UNIQUE de position
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        await tx.update(stages).set({ position: -(i + 1) }).where(eq(stages.id, id));
      }
      // 2. Asignar las posiciones positivas definitivas
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        await tx.update(stages).set({ position: i + 1 }).where(eq(stages.id, id));
      }
    });

    return { ok: true };
  });

  app.get('/api/stages', { preHandler: requireAuth }, async () => {
    return { items: await db.select().from(stages).orderBy(stages.position) };
  });

  app.patch('/api/stages/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = idParam.parse(request.params);
    const { name } = z.object({ name: z.string().min(1).max(60) }).parse(request.body);
    const [stage] = await db.update(stages).set({ name }).where(eq(stages.id, id)).returning();
    if (!stage) throw notFound('Etapa no encontrada');
    return stage;
  });

  app.post('/api/stages', { preHandler: requireAdmin }, async (request, reply) => {
    const { name } = z.object({ name: z.string().min(1).max(60) }).parse(request.body);
    const allStages = await db.select().from(stages).orderBy(stages.position);
    const maxPosition = allStages.length > 0 ? Math.max(...allStages.map((s) => s.position)) : 0;

    const [stage] = await db
      .insert(stages)
      .values({ name, position: maxPosition + 1 })
      .returning();

    reply.code(201);
    return stage;
  });

  app.delete('/api/stages/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = idParam.parse(request.params);

    const hasLeads = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.stageId, id))
      .limit(1);

    if (hasLeads.length > 0) {
      throw badRequest('STAGE_HAS_LEADS', 'La columna tiene contactos activos. Muévelos antes de eliminarla.');
    }

    const [deletedStage] = await db.select().from(stages).where(eq(stages.id, id));
    if (!deletedStage) throw notFound('Etapa no encontrada');

    await db.transaction(async (tx) => {
      await tx.delete(stages).where(eq(stages.id, id));

      const remaining = await tx.select().from(stages).orderBy(stages.position);
      for (let i = 0; i < remaining.length; i++) {
        const s = remaining[i]!;
        await tx.update(stages).set({ position: i + 1 }).where(eq(stages.id, s.id));
      }
    });

    return { ok: true };
  });

  // 1. Crear contacto manualmente
  app.post('/api/contacts', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(1).max(100),
        phone: z.string().min(5).max(30).nullable().optional(),
        waId: z.string().min(5).max(50),
        inboxId: z.number().int().positive(),
      })
      .parse(request.body);

    const [existing] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.inboxId, body.inboxId), eq(contacts.waId, body.waId)));

    if (existing) {
      throw badRequest('CONTACT_EXISTS', 'Ya existe un contacto con este identificador de WhatsApp en esta bandeja.');
    }

    const [firstStage] = await db.select().from(stages).orderBy(stages.position).limit(1);
    if (!firstStage) throw badRequest('NO_STAGES', 'No hay etapas del embudo configuradas. Ejecuta el seed.');

    const [contact] = await db
      .insert(contacts)
      .values({
        inboxId: body.inboxId,
        waId: body.waId,
        name: body.name,
        phone: body.phone || null,
        stageId: firstStage.id,
        leadScoring: null,
      })
      .returning();

    if (!contact) throw new Error('No se pudo crear el contacto.');

    const [conversation] = await db
      .insert(conversations)
      .values({
        inboxId: body.inboxId,
        contactId: contact.id,
        lastMessagePreview: 'Conversación creada manualmente',
        unreadCount: 0,
        autoReply: 'active',
        needsHuman: true,
        needsHumanReason: 'Creación manual',
      })
      .returning();

    reply.code(201);

    if (conversation) {
      const summary = await serializeConversation(conversation.id);
      if (summary) {
        broadcast('conversation:created', summary);
        broadcast('conversation:updated', summary);
      }
    }

    return contact;
  });

  // 2. Eliminar contacto manualmente
  app.delete('/api/contacts/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = idParam.parse(request.params);
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    if (!contact) throw notFound('Contacto no encontrado');

    const convs = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.contactId, id));
    const convIds = convs.map((c) => c.id);

    await db.transaction(async (tx) => {
      if (convIds.length > 0) {
        await tx.delete(messages).where(inArray(messages.conversationId, convIds));
        await tx.delete(conversations).where(eq(conversations.contactId, id));
      }
      await tx.delete(contactTags).where(eq(contactTags.contactId, id));
      await tx.delete(contacts).where(eq(contacts.id, id));
    });

    broadcast('lead:deleted', { contact_id: id });

    return { ok: true };
  });

  // 3. Simular traslado automático de leads en el Kanban
  app.post('/api/contacts/:id/simulate-activity', { preHandler: requireAuth }, async (request) => {
    const me = requireAuthUser(request);
    const { id } = idParam.parse(request.params);
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    if (!contact) throw notFound('Contacto no encontrado');

    const allStages = await db.select().from(stages).orderBy(stages.position);
    const currentIdx = allStages.findIndex((s) => s.id === contact.stageId);

    const nextIdx = currentIdx < allStages.length - 1 ? currentIdx + 1 : 0;
    const nextStage = allStages[nextIdx]!;

    const fromStageId = contact.stageId;

    await db
      .update(contacts)
      .set({ stageId: nextStage.id, stageChangedAt: new Date() })
      .where(eq(contacts.id, id));

    broadcast('lead:stage_changed', { contact_id: id, stage_id: nextStage.id, by_user_id: me.id });
    emitEvent('lead:stage_changed', { contactId: id, fromStageId, toStageId: nextStage.id });

    const convs = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.contactId, id));
    for (const c of convs) {
      const summary = await serializeConversation(c.id);
      if (summary) broadcast('conversation:updated', summary);
    }

    return { ok: true, from_stage: fromStageId, to_stage: nextStage.id, stage_name: nextStage.name };
  });
}
