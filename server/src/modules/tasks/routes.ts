import { and, eq, desc, lte, gte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../../auth/guards.js';
import { db } from '../../db/client.js';
import { tasks, contacts, conversations, users } from '../../db/schema.js';
import { notFound, badRequest } from '../../lib/errors.js';
import { taskService } from './service.js';

export function taskRoutes(app: FastifyInstance) {
  // Listar tareas del usuario
  app.get('/api/tasks', { preHandler: requireAuth }, async (request) => {
    const q = z
      .object({
        status: z.string().optional(),
        priority: z.string().optional(),
        contact_id: z.coerce.number().optional(),
        due_before: z.string().datetime().optional(),
        due_after: z.string().datetime().optional(),
      })
      .parse(request.query);

    const filters: Parameters<typeof taskService.getUserTasks>[1] = {};
    if (q.status) filters.status = q.status;
    if (q.priority) filters.priority = q.priority;
    if (q.contact_id) filters.contactId = q.contact_id;
    if (q.due_before) filters.dueBefore = new Date(q.due_before);
    if (q.due_after) filters.dueAfter = new Date(q.due_after);

    const userTasks = await taskService.getUserTasks(request.currentUser!.id, filters);
    return { items: userTasks };
  });

  // Crear tarea
  app.post('/api/tasks', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        type: z.enum(['call', 'meeting', 'follow_up', 'demo', 'proposal', 'custom']).default('follow_up'),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
        contact_id: z.number().int().positive().optional(),
        conversation_id: z.number().int().positive().optional(),
        assigned_to: z.number().int().positive().optional(),
        due_date: z.string().datetime(),
        location: z.string().optional(),
        attendees: z.array(z.string()).optional(),
        reminder_minutes_before: z.number().int().min(0).default(30),
      })
      .parse(request.body);

    // Verificar contacto si se proporciona
    if (body.contact_id) {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, body.contact_id));
      if (!contact) throw notFound('Contacto no encontrado');
    }

    // Verificar conversación si se proporciona
    if (body.conversation_id) {
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, body.conversation_id));
      if (!conversation) throw notFound('Conversación no encontrada');
    }

    const task = await taskService.createTask({
      ...body,
      assignedTo: body.assigned_to ?? request.currentUser!.id,
      createdBy: request.currentUser!.id,
      dueDate: new Date(body.due_date),
    });

    reply.code(201);
    return task;
  });

  // Obtener detalle de tarea
  app.get('/api/tasks/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) throw notFound('Tarea no encontrada');
    return taskService.serializeTask(task);
  });

  // Actualizar tarea
  app.patch('/api/tasks/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const body = z
      .object({
        title: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        type: z.enum(['call', 'meeting', 'follow_up', 'demo', 'proposal', 'custom']).optional(),
        status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        due_date: z.string().datetime().optional(),
        location: z.string().optional(),
        attendees: z.array(z.string()).optional(),
        reminder_minutes_before: z.number().int().min(0).optional(),
      })
      .parse(request.body);

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.type !== undefined) updates.type = body.type;
    if (body.status !== undefined) updates.status = body.status;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.due_date !== undefined) updates.dueDate = new Date(body.due_date);
    if (body.location !== undefined) updates.location = body.location;
    if (body.attendees !== undefined) updates.attendees = body.attendees;
    if (body.reminder_minutes_before !== undefined) updates.reminderMinutesBefore = body.reminder_minutes_before;

    const result = await taskService.updateTask(id, updates);
    if (!result) throw notFound('Tarea no encontrada');
    return result;
  });

  // Marcar como completada
  app.post('/api/tasks/:id/complete', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const result = await taskService.completeTask(id);
    if (!result) throw notFound('Tarea no encontrada');
    return result;
  });

  // Eliminar tarea
  app.delete('/api/tasks/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [existing] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!existing) throw notFound('Tarea no encontrada');

    // Solo el creador o admin puede eliminar
    if (existing.createdBy !== request.currentUser!.id && request.currentUser!.role !== 'admin') {
      throw badRequest('FORBIDDEN', 'No tienes permisos para eliminar esta tarea');
    }

    return taskService.deleteTask(id);
  });

  // Obtener ocupación del usuario
  app.get('/api/tasks/busyness', { preHandler: requireAuth }, async (request) => {
    const busyness = await taskService.getUserBusyness(request.currentUser!.id);
    return { busyness };
  });

  // Obtener tareas vencidas (admin)
  app.get('/api/tasks/overdue', { preHandler: requireAdmin }, async () => {
    const overdue = await taskService.getOverdueTasks();
    return { items: overdue };
  });
}
