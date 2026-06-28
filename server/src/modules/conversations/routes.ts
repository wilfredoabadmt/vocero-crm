import { and, desc, eq, exists, ilike, lt, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAuthUser } from '../../auth/guards.js';
import { db } from '../../db/client.js';
import { aiAgents, contactTags, contacts, conversations, messages, users } from '../../db/schema.js';
import { notFound } from '../../lib/errors.js';
import { broadcast } from '../../realtime/hub.js';
import { serializeMessage } from '../messages/serialize.js';
import { sendMessage } from '../messages/send.js';
import { serializeConversation, serializeConversations } from './serialize.js';
import { chatCompletion, type ChatMessage } from '../../integrations/openrouter/client.js';
import { retrieveChunks } from '../../rag/index.js';
import { getOpenRouterKey } from '../settings/routes.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export function conversationRoutes(app: FastifyInstance) {
  app.get('/api/conversations', { preHandler: requireAuth }, async (request) => {
    const q = z
      .object({
        search: z.string().optional(),
        tag_id: z.coerce.number().optional(),
        stage_id: z.coerce.number().optional(),
        inbox_id: z.coerce.number().optional(),
        cursor: z.coerce.number().optional(), // id de la última conversación vista
        limit: z.coerce.number().min(1).max(50).default(30),
      })
      .parse(request.query);

    const conditions = [];
    if (q.inbox_id) conditions.push(eq(conversations.inboxId, q.inbox_id));
    if (q.stage_id) conditions.push(eq(contacts.stageId, q.stage_id));
    if (q.search) {
      const term = `%${q.search}%`;
      conditions.push(or(ilike(contacts.name, term), ilike(contacts.waId, term), ilike(contacts.phone, term)));
    }
    if (q.tag_id) {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(contactTags)
            .where(and(eq(contactTags.contactId, contacts.id), eq(contactTags.tagId, q.tag_id))),
        ),
      );
    }
    if (q.cursor) {
      const [cursorRow] = await db
        .select({ lastMessageAt: conversations.lastMessageAt })
        .from(conversations)
        .where(eq(conversations.id, q.cursor));
      if (cursorRow?.lastMessageAt) {
        conditions.push(
          or(
            lt(conversations.lastMessageAt, cursorRow.lastMessageAt),
            and(eq(conversations.lastMessageAt, cursorRow.lastMessageAt), lt(conversations.id, q.cursor)),
          ),
        );
      } else if (q.cursor) {
        conditions.push(lt(conversations.id, q.cursor));
      }
    }

    const rows = await db
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(contacts, eq(conversations.contactId, contacts.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(sql`${conversations.lastMessageAt} DESC NULLS LAST`, desc(conversations.id))
      .limit(q.limit);

    const ids = rows.map((r) => r.id);
    const summaries = await serializeConversations(ids);
    const byId = new Map(summaries.map((s) => [s.id, s]));
    const items = ids.map((id) => byId.get(id)).filter(Boolean);
    return { items, next_cursor: ids.length === q.limit ? ids[ids.length - 1] : null };
  });

  app.get('/api/conversations/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = idParam.parse(request.params);
    const summary = await serializeConversation(id);
    if (!summary) throw notFound('Conversación no encontrada');
    return summary;
  });

  app.get('/api/conversations/:id/messages', { preHandler: requireAuth }, async (request) => {
    const { id } = idParam.parse(request.params);
    const q = z
      .object({ before: z.coerce.number().optional(), limit: z.coerce.number().min(1).max(50).default(50) })
      .parse(request.query);

    const conditions = [eq(messages.conversationId, id)];
    if (q.before) conditions.push(lt(messages.id, q.before));

    const rows = await db
      .select({
        message: messages,
        userName: users.name,
        agentName: aiAgents.name,
        contactName: contacts.name,
      })
      .from(messages)
      .leftJoin(users, eq(messages.authorUserId, users.id))
      .leftJoin(aiAgents, eq(messages.authorAgentId, aiAgents.id))
      .leftJoin(conversations, eq(messages.conversationId, conversations.id))
      .leftJoin(contacts, eq(conversations.contactId, contacts.id))
      .where(and(...conditions))
      .orderBy(desc(messages.id))
      .limit(q.limit);

    const items = rows
      .map((r) =>
        serializeMessage(
          r.message,
          r.message.authorType === 'user' ? r.userName : r.message.authorType === 'ai_agent' ? r.agentName : r.contactName,
        ),
      )
      .reverse();
    return { items, next_before: rows.length === q.limit ? rows[rows.length - 1]!.message.id : null };
  });

  app.post('/api/conversations/:id/messages', { preHandler: requireAuth }, async (request, reply) => {
    const me = requireAuthUser(request);
    const { id } = idParam.parse(request.params);
    const body = z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('text'), body: z.string().min(1).max(4096) }),
        z.object({
          type: z.literal('template'),
          template_id: z.number().int().positive(),
          variables: z.array(z.string().max(500)).default([]),
        }),
      ])
      .parse(request.body);

    const message = await sendMessage(id, body, { kind: 'user', userId: me.id, name: me.name });
    reply.code(201);
    return message;
  });

  app.post('/api/conversations/:id/read', { preHandler: requireAuth }, async (request) => {
    const { id } = idParam.parse(request.params);
    await db.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, id));
    const summary = await serializeConversation(id);
    if (summary) broadcast('conversation:updated', summary);
    return { ok: true };
  });

  app.patch('/api/conversations/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = idParam.parse(request.params);
    const body = z
      .object({
        auto_reply: z.enum(['active', 'paused']).optional(),
        assigned_agent_id: z.number().int().positive().nullable().optional(),
        needs_human: z.literal(false).optional(),
      })
      .parse(request.body);

    const updates: Record<string, unknown> = {};
    if (body.auto_reply) updates.autoReply = body.auto_reply;
    if ('assigned_agent_id' in body) updates.assignedAgentId = body.assigned_agent_id;
    if (body.needs_human === false) {
      updates.needsHuman = false;
      updates.needsHumanReason = null;
    }
    if (Object.keys(updates).length > 0) {
      const result = await db.update(conversations).set(updates).where(eq(conversations.id, id)).returning();
      if (result.length === 0) throw notFound('Conversación no encontrada');
    }
    const summary = await serializeConversation(id);
    if (!summary) throw notFound('Conversación no encontrada');
    broadcast('conversation:updated', summary);
    return summary;
  });

  // 6. Sugerir una respuesta basada en IA para el asesor (Copiloto)
  app.post('/api/conversations/:id/suggest-reply', { preHandler: requireAuth }, async (request) => {
    const { id } = idParam.parse(request.params);
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conversation) throw notFound('Conversación no encontrada');

    const apiKey = await getOpenRouterKey();
    if (!apiKey) return { suggestion: '' }; // IA no configurada

    // Cargar agente asignado o por defecto
    let agent: typeof aiAgents.$inferSelect | undefined;
    if (conversation.assignedAgentId) {
      [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, conversation.assignedAgentId));
    }
    if (!agent) [agent] = await db.select().from(aiAgents).where(eq(aiAgents.isDefault, true));
    if (!agent) return { suggestion: 'Por favor, crea un agente de IA por defecto primero.' };

    // Obtener historial de mensajes (últimos 10)
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(desc(messages.id))
      .limit(10);

    const chronological = [...history].reverse();
    const chat: ChatMessage[] = chronological.map((m) => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.body ?? '[Multimedia]',
    }));

    const lastInbound = chronological.filter((m) => m.direction === 'in').slice(-2);
    const query = lastInbound.map((m) => m.body ?? '').join(' ');
    const ragChunks = await retrieveChunks(agent.id, query);

    const systemPrompt = `Eres un copiloto de IA para un asesor humano del negocio. Sugiere una respuesta única, extremadamente breve, natural y persuasiva en español para responder al cliente de WhatsApp, basada en la conversación y la información comercial.
NO uses Markdown, ni negritas, ni viñetas. Escribe un mensaje directo y listo para enviar.

## Personalidad del Agente
Nombre: ${agent.name}
Propósito: ${agent.purpose}
${agent.tone ? `Tono: ${agent.tone}` : ''}
${agent.instructions ? `Reglas: ${agent.instructions}` : ''}
${agent.businessInfo ? `Información comercial: ${agent.businessInfo}` : ''}

${ragChunks.length > 0 ? `## Base de conocimiento:\n${ragChunks.join('\n\n')}` : ''}

Sugiere la mejor respuesta en base a esto.`;

    try {
      const suggestion = await chatCompletion(apiKey, agent.model, [
        { role: 'system', content: systemPrompt },
        ...chat,
      ]);
      return { suggestion: suggestion.trim() };
    } catch (err) {
      console.error('[SuggestReply] Error llamando a OpenRouter:', err);
      return { suggestion: 'No se pudo generar una sugerencia de IA en este momento.' };
    }
  });
}
