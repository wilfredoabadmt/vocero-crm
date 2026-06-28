import { sql, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../auth/guards.js';
import { db } from '../../db/client.js';
import { messages, contacts, stages, users } from '../../db/schema.js';
import { analyticsService } from './service.js';

export function analyticsRoutes(app: FastifyInstance) {
  // Dashboard principal (mejorado)
  app.get('/api/analytics/dashboard', { preHandler: requireAuth }, async (request) => {
    const q = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(request.query);

    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return analyticsService.getDashboard({ from, to });
  });

  // Análisis por fuente de leads
  app.get('/api/analytics/sources', { preHandler: requireAuth }, async (request) => {
    const q = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(request.query);

    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return analyticsService.getSourceAnalytics({ from, to });
  });

  // Scorecard de agente
  app.get('/api/analytics/agents/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const q = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(request.query);

    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return analyticsService.getAgentScorecard(id, { from, to });
  });

  // Top agentes
  app.get('/api/analytics/top-agents', { preHandler: requireAuth }, async (request) => {
    const q = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.coerce.number().int().positive().max(50).default(10),
      })
      .parse(request.query);

    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const agents = await analyticsService.getTopAgents({ from, to });
    return { items: agents.slice(0, q.limit) };
  });

  // Leads por etapa (endpoint dedicado)
  app.get('/api/analytics/leads-by-stage', { preHandler: requireAuth }, async () => {
    const result = await db
      .select({
        stageId: stages.id,
        stageName: stages.name,
        count: sql<number>`count(${contacts.id})::int`,
      })
      .from(stages)
      .leftJoin(contacts, eq(contacts.stageId, stages.id))
      .groupBy(stages.id, stages.name)
      .orderBy(stages.position);

    return {
      items: result.map((s) => ({
        id: s.stageId,
        name: s.stageName,
        count: s.count,
      })),
    };
  });

  // Volumen de mensajes (endpoint dedicado)
  app.get('/api/analytics/messages-volume', { preHandler: requireAuth }, async (request) => {
    const q = z
      .object({
        days: z.coerce.number().int().positive().max(90).default(7),
      })
      .parse(request.query);

    const result = await db.execute<{ date: string; direction: string; count: number }>(sql`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM-DD') as date,
        direction,
        count(*)::int as count
      FROM messages
      WHERE created_at >= NOW() - INTERVAL '${q.days} days'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD'), direction
      ORDER BY date ASC
    `);

    return { items: Array.isArray(result) ? result : (result as any).rows || [] };
  });

  // Respuesta IA vs Humano
  app.get('/api/analytics/ai-vs-human', { preHandler: requireAuth }, async (request) => {
    const q = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(request.query);

    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await db
      .select({
        authorType: messages.authorType,
        count: sql<number>`count(*)::int`,
      })
      .from(messages)
      .where(eq(messages.direction, 'out'))
      .groupBy(messages.authorType);

    return {
      items: result.map((h) => ({
        authorType: h.authorType,
        count: h.count,
      })),
    };
  });
}
