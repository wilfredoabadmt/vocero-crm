import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../auth/guards.js';
import { db } from '../../db/client.js';
import { assignmentRules, assignmentRuleAgents, users } from '../../db/schema.js';
import { notFound, badRequest } from '../../lib/errors.js';
import { broadcast } from '../../realtime/hub.js';
import { assignmentService } from './service.js';

function serializeRule(r: typeof assignmentRules.$inferSelect, agents: Array<{ userId: number; weight: number; maxLeads: number | null }>) {
  return {
    id: r.id,
    name: r.name,
    inbox_id: r.inboxId,
    mode: r.mode,
    is_active: r.isActive,
    priority: r.priority,
    filter_stage_id: r.filterStageId,
    filter_tag_ids: r.filterTagIds,
    filter_min_score: r.filterMinScore,
    filter_business_hours: r.filterBusinessHours,
    working_hours_start: r.workingHoursStart,
    working_hours_end: r.workingHoursEnd,
    working_days: r.workingDays,
    agents,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

export function assignmentRoutes(app: FastifyInstance) {
  // Listar reglas de asignación
  app.get('/api/assignments/rules', { preHandler: requireAdmin }, async () => {
    const rules = await db.select().from(assignmentRules).orderBy(desc(assignmentRules.priority));

    const rulesWithAgents = await Promise.all(
      rules.map(async (rule) => {
        const agents = await db
          .select()
          .from(assignmentRuleAgents)
          .where(eq(assignmentRuleAgents.ruleId, rule.id));
        return serializeRule(
          rule,
          agents.map((a) => ({ userId: a.userId, weight: a.weight, maxLeads: a.maxLeads }))
        );
      })
    );

    return { items: rulesWithAgents };
  });

  // Crear regla de asignación
  app.post('/api/assignments/rules', { preHandler: requireAdmin }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(1).max(255),
        inbox_id: z.number().int().positive().nullable().optional(),
        mode: z.enum(['round_robin', 'random', 'least_loaded', 'weighted', 'manual']).default('round_robin'),
        priority: z.number().int().min(0).default(0),
        filter_stage_id: z.number().int().positive().nullable().optional(),
        filter_tag_ids: z.array(z.number().int().positive()).optional(),
        filter_min_score: z.number().int().min(1).max(100).nullable().optional(),
        filter_business_hours: z.boolean().default(false),
        working_hours_start: z.number().int().min(0).max(23).default(9),
        working_hours_end: z.number().int().min(0).max(23).default(18),
        working_days: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
        agents: z.array(z.object({ user_id: z.number().int().positive(), weight: z.number().int().positive().default(1), max_leads: z.number().int().positive().nullable().optional() })).min(1),
      })
      .parse(request.body);

    // Verificar que los usuarios existen
    const userIds = body.agents.map((a) => a.user_id);
    const existingUsers = await db.select().from(users).where(eq(users.isActive, true));
    const validUserIds = new Set(existingUsers.map((u) => u.id));
    const invalidUsers = userIds.filter((id) => !validUserIds.has(id));
    if (invalidUsers.length > 0) {
      throw badRequest('INVALID_USERS', `Usuarios no válidos: ${invalidUsers.join(', ')}`);
    }

    // Crear regla
    const [rule] = await db
      .insert(assignmentRules)
      .values({
        name: body.name,
        inboxId: body.inbox_id,
        mode: body.mode,
        priority: body.priority,
        filterStageId: body.filter_stage_id,
        filterTagIds: body.filter_tag_ids ?? [],
        filterMinScore: body.filter_min_score,
        filterBusinessHours: body.filter_business_hours,
        workingHoursStart: body.working_hours_start,
        workingHoursEnd: body.working_hours_end,
        workingDays: body.working_days,
      })
      .returning();

    // Asociar agentes
    for (const agent of body.agents) {
      await db.insert(assignmentRuleAgents).values({
        ruleId: rule!.id,
        userId: agent.user_id,
        weight: agent.weight,
        maxLeads: agent.max_leads,
      });
    }

    broadcast('assignment:rule_created', { rule_id: rule!.id });

    reply.code(201);
    return serializeRule(rule!, body.agents.map((a) => ({ userId: a.user_id, weight: a.weight, maxLeads: a.max_leads ?? null })));
  });

  // Actualizar regla de asignación
  app.patch('/api/assignments/rules/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [existing] = await db.select().from(assignmentRules).where(eq(assignmentRules.id, id));
    if (!existing) throw notFound('Regla no encontrada');

    const body = z
      .object({
        name: z.string().min(1).max(255).optional(),
        inbox_id: z.number().int().positive().nullable().optional(),
        mode: z.enum(['round_robin', 'random', 'least_loaded', 'weighted', 'manual']).optional(),
        priority: z.number().int().min(0).optional(),
        is_active: z.boolean().optional(),
        filter_stage_id: z.number().int().positive().nullable().optional(),
        filter_tag_ids: z.array(z.number().int().positive()).optional(),
        filter_min_score: z.number().int().min(1).max(100).nullable().optional(),
        filter_business_hours: z.boolean().optional(),
        working_hours_start: z.number().int().min(0).max(23).optional(),
        working_hours_end: z.number().int().min(0).max(23).optional(),
        working_days: z.array(z.number().int().min(0).max(6)).optional(),
        agents: z.array(z.object({ user_id: z.number().int().positive(), weight: z.number().int().positive().default(1), max_leads: z.number().int().positive().nullable().optional() })).optional(),
      })
      .parse(request.body);

    // Actualizar regla
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.inbox_id !== undefined) updates.inboxId = body.inbox_id;
    if (body.mode !== undefined) updates.mode = body.mode;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.is_active !== undefined) updates.isActive = body.is_active;
    if (body.filter_stage_id !== undefined) updates.filterStageId = body.filter_stage_id;
    if (body.filter_tag_ids !== undefined) updates.filterTagIds = body.filter_tag_ids;
    if (body.filter_min_score !== undefined) updates.filterMinScore = body.filter_min_score;
    if (body.filter_business_hours !== undefined) updates.filterBusinessHours = body.filter_business_hours;
    if (body.working_hours_start !== undefined) updates.workingHoursStart = body.working_hours_start;
    if (body.working_hours_end !== undefined) updates.workingHoursEnd = body.working_hours_end;
    if (body.working_days !== undefined) updates.workingDays = body.working_days;

    if (Object.keys(updates).length > 0) {
      await db.update(assignmentRules).set(updates).where(eq(assignmentRules.id, id));
    }

    // Actualizar agentes si se proporcionan
    if (body.agents) {
      await db.delete(assignmentRuleAgents).where(eq(assignmentRuleAgents.ruleId, id));
      for (const agent of body.agents) {
        await db.insert(assignmentRuleAgents).values({
          ruleId: id,
          userId: agent.user_id,
          weight: agent.weight,
          maxLeads: agent.max_leads,
        });
      }
    }

    broadcast('assignment:rule_updated', { rule_id: id });

    const updated = (await db.select().from(assignmentRules).where(eq(assignmentRules.id, id)))[0];
    const agents = await db.select().from(assignmentRuleAgents).where(eq(assignmentRuleAgents.ruleId, id));

    return serializeRule(
      updated!,
      agents.map((a) => ({ userId: a.userId, weight: a.weight, maxLeads: a.maxLeads }))
    );
  });

  // Eliminar regla de asignación
  app.delete('/api/assignments/rules/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [existing] = await db.select().from(assignmentRules).where(eq(assignmentRules.id, id));
    if (!existing) throw notFound('Regla no encontrada');

    await db.delete(assignmentRules).where(eq(assignmentRules.id, id));

    broadcast('assignment:rule_deleted', { rule_id: id });

    return { ok: true };
  });

  // Obtener estadísticas de carga por agente
  app.get('/api/assignments/stats', { preHandler: requireAuth }, async () => {
    const workloads = await assignmentService.getAgentWorkloads();
    return { items: workloads };
  });

  // Probar regla con un contacto específico
  app.post('/api/assignments/rules/:id/test', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const body = z.object({ contact_id: z.number().int().positive() }).parse(request.body);

    const [existing] = await db.select().from(assignmentRules).where(eq(assignmentRules.id, id));
    if (!existing) throw notFound('Regla no encontrada');

    const assignedUserId = await assignmentService.assignContact(body.contact_id, existing.inboxId ?? 0);

    return {
      assigned: assignedUserId !== null,
      assigned_to: assignedUserId,
      rule_id: id,
    };
  });
}
