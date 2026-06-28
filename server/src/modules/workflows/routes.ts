import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../auth/guards.js';
import { db } from '../../db/client.js';
import { workflows, workflowLogs, contacts } from '../../db/schema.js';
import { notFound } from '../../lib/errors.js';

const workflowSchema = z.object({
  name: z.string().min(1).max(100),
  trigger: z.enum(['lead_stage_changed', 'message_created']),
  conditions: z.record(z.any()),
  actions: z.array(
    z.object({
      type: z.enum(['send_whatsapp_template', 'send_email_mock', 'assign_agent']),
      templateId: z.number().int().optional(),
      agentId: z.number().int().optional(),
      emailTo: z.string().optional(),
      emailBody: z.string().optional(),
    })
  ),
  isActive: z.boolean().default(true),
});

export function workflowRoutes(app: FastifyInstance) {
  // 1. Listar todas las automatizaciones (solo administrador)
  app.get('/api/workflows', { preHandler: requireAdmin }, async () => {
    const items = await db.select().from(workflows).orderBy(desc(workflows.id));
    return { items };
  });

  // 2. Crear una nueva automatización (solo administrador)
  app.post('/api/workflows', { preHandler: requireAdmin }, async (request, reply) => {
    const body = workflowSchema.parse(request.body);
    const [item] = await db.insert(workflows).values(body).returning();
    reply.code(201);
    return item;
  });

  // 3. Modificar una automatización (solo administrador)
  app.patch('/api/workflows/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const body = workflowSchema.partial().parse(request.body);
    
    const [item] = await db
      .update(workflows)
      .set(body)
      .where(eq(workflows.id, id))
      .returning();

    if (!item) throw notFound('Automatización no encontrada');
    return item;
  });

  // 4. Eliminar una automatización (solo administrador)
  app.delete('/api/workflows/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const [item] = await db.delete(workflows).where(eq(workflows.id, id)).returning();
    if (!item) throw notFound('Automatización no encontrada');
    return { ok: true };
  });

  // 5. Listar los logs de auditoría de automatización (solo administrador)
  app.get('/api/workflows/logs', { preHandler: requireAdmin }, async () => {
    const rows = await db
      .select({
        log: workflowLogs,
        workflowName: workflows.name,
        contactName: contacts.name,
        contactPhone: contacts.phone,
      })
      .from(workflowLogs)
      .innerJoin(workflows, eq(workflowLogs.workflowId, workflows.id))
      .leftJoin(contacts, eq(workflowLogs.contactId, contacts.id))
      .orderBy(desc(workflowLogs.id))
      .limit(100); // Límite de los últimos 100 eventos de auditoría

    return {
      items: rows.map((r) => ({
        id: r.log.id,
        workflow_id: r.log.workflowId,
        workflow_name: r.workflowName,
        contact_name: r.contactName ?? 'Contacto Desconocido',
        contact_phone: r.contactPhone ?? '',
        status: r.log.status,
        error: r.log.error,
        executed_at: r.log.executedAt.toISOString(),
      })),
    };
  });
}
