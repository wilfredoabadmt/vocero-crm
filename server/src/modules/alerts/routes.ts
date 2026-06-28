import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../../auth/guards.js';
import { db } from '../../db/client.js';
import { alertRules } from '../../db/schema.js';
import { notFound, badRequest } from '../../lib/errors.js';
import { alertEngine } from './service.js';

export function alertRoutes(app: FastifyInstance) {
  // Listar reglas de alerta
  app.get('/api/alert-rules', { preHandler: requireAuth }, async () => {
    const rules = await alertEngine.getRules();
    return { items: rules };
  });

  // Crear regla de alerta
  app.post('/api/alert-rules', { preHandler: requireAdmin }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(1).max(255),
        type: z.enum(['stale_lead', 'no_response', 'stage_stuck', 'custom']).default('stale_lead'),
        threshold_hours: z.number().int().min(1).default(24),
        filter_stage_id: z.number().int().positive().optional(),
        filter_tag_ids: z.array(z.number().int().positive()).optional(),
        filter_assigned_to: z.number().int().positive().optional(),
        actions: z.array(z.enum(['notify', 'reassign', 'tag', 'email'])).default(['notify']),
        notify_user_ids: z.array(z.number().int().positive()).optional(),
        message_template: z.string().optional(),
      })
      .parse(request.body);

    const rule = await alertEngine.createRule({
      ...body,
      thresholdHours: body.threshold_hours,
      filterStageId: body.filter_stage_id,
      filterTagIds: body.filter_tag_ids,
      filterAssignedTo: body.filter_assigned_to,
      notifyUserIds: body.notify_user_ids,
      messageTemplate: body.message_template,
      createdBy: request.currentUser!.id,
    });

    reply.code(201);
    return rule;
  });

  // Actualizar regla de alerta
  app.patch('/api/alert-rules/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).max(255).optional(),
        type: z.enum(['stale_lead', 'no_response', 'stage_stuck', 'custom']).optional(),
        is_active: z.boolean().optional(),
        threshold_hours: z.number().int().min(1).optional(),
        filter_stage_id: z.number().int().positive().nullable().optional(),
        filter_tag_ids: z.array(z.number().int().positive()).optional(),
        filter_assigned_to: z.number().int().positive().nullable().optional(),
        actions: z.array(z.enum(['notify', 'reassign', 'tag', 'email'])).optional(),
        notify_user_ids: z.array(z.number().int().positive()).optional(),
        message_template: z.string().nullable().optional(),
      })
      .parse(request.body);

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.type !== undefined) updates.type = body.type;
    if (body.is_active !== undefined) updates.isActive = body.is_active;
    if (body.threshold_hours !== undefined) updates.thresholdHours = body.threshold_hours;
    if (body.filter_stage_id !== undefined) updates.filterStageId = body.filter_stage_id;
    if (body.filter_tag_ids !== undefined) updates.filterTagIds = body.filter_tag_ids;
    if (body.filter_assigned_to !== undefined) updates.filterAssignedTo = body.filter_assigned_to;
    if (body.actions !== undefined) updates.actions = body.actions;
    if (body.notify_user_ids !== undefined) updates.notifyUserIds = body.notify_user_ids;
    if (body.message_template !== undefined) updates.messageTemplate = body.message_template;

    const result = await alertEngine.updateRule(id, updates);
    if (!result) throw notFound('Regla de alerta no encontrada');
    return result;
  });

  // Eliminar regla de alerta
  app.delete('/api/alert-rules/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [existing] = await db.select().from(alertRules).where(eq(alertRules.id, id));
    if (!existing) throw notFound('Regla de alerta no encontrada');
    return alertEngine.deleteRule(id);
  });

  // Obtener alertas del usuario actual
  app.get('/api/alerts', { preHandler: requireAuth }, async (request) => {
    const alerts = await alertEngine.getUserAlerts(request.currentUser!.id);
    return { items: alerts };
  });

  // Obtener conteo de alertas pendientes
  app.get('/api/alerts/count', { preHandler: requireAuth }, async (request) => {
    const count = await alertEngine.getAlertCount(request.currentUser!.id);
    return { count };
  });

  // Marcar alerta como reconocida
  app.post('/api/alerts/:id/acknowledge', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const result = await alertEngine.acknowledgeAlert(id, request.currentUser!.id);
    if (!result) throw notFound('Alerta no encontrada');
    return result;
  });

  // Marcar alerta como resuelta
  app.post('/api/alerts/:id/resolve', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const result = await alertEngine.resolveAlert(id, request.currentUser!.id);
    if (!result) throw notFound('Alerta no encontrada');
    return result;
  });

  // Descartar alerta
  app.post('/api/alerts/:id/dismiss', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const result = await alertEngine.dismissAlert(id);
    if (!result) throw notFound('Alerta no encontrada');
    return result;
  });

  // Evaluar todas las reglas manualmente (admin)
  app.post('/api/alerts/evaluate', { preHandler: requireAdmin }, async () => {
    const result = await alertEngine.evaluateRules();
    return result;
  });
}
