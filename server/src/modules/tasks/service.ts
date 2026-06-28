import { and, eq, desc, lte, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { tasks, contacts, conversations, users } from '../../db/schema.js';
import { broadcast } from '../../realtime/hub.js';

export class TaskService {
  // Crear tarea
  async createTask(data: {
    title: string;
    description?: string;
    type?: string;
    priority?: string;
    contactId?: number;
    conversationId?: number;
    assignedTo: number;
    createdBy: number;
    dueDate: Date;
    location?: string;
    attendees?: string[];
    reminderMinutesBefore?: number;
  }) {
    const [task] = await db
      .insert(tasks)
      .values({
        title: data.title,
        description: data.description,
        type: (data.type as any) ?? 'follow_up',
        priority: (data.priority as any) ?? 'medium',
        contactId: data.contactId,
        conversationId: data.conversationId,
        assignedTo: data.assignedTo,
        createdBy: data.createdBy,
        dueDate: data.dueDate,
        location: data.location,
        attendees: data.attendees ?? [],
        reminderMinutesBefore: data.reminderMinutesBefore ?? 30,
      })
      .returning();

    broadcast('task:created', { task: this.serializeTask(task!) });
    return this.serializeTask(task!);
  }

  // Actualizar tarea
  async updateTask(taskId: number, data: Partial<{
    title: string;
    description: string;
    type: string;
    status: string;
    priority: string;
    dueDate: Date;
    location: string;
    attendees: string[];
    reminderMinutesBefore: number;
  }>) {
    const updates: Record<string, unknown> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.type !== undefined) updates.type = data.type;
    if (data.status !== undefined) {
      updates.status = data.status;
      if (data.status === 'completed') updates.completedAt = new Date();
      if (data.status === 'in_progress') updates.startedAt = new Date();
    }
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.dueDate !== undefined) updates.dueDate = data.dueDate;
    if (data.location !== undefined) updates.location = data.location;
    if (data.attendees !== undefined) updates.attendees = data.attendees;
    if (data.reminderMinutesBefore !== undefined) updates.reminderMinutesBefore = data.reminderMinutesBefore;

    const [updated] = await db
      .update(tasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
      .returning();

    if (updated) {
      broadcast('task:updated', { task: this.serializeTask(updated) });
    }

    return updated ? this.serializeTask(updated) : null;
  }

  // Marcar como completada
  async completeTask(taskId: number) {
    return this.updateTask(taskId, { status: 'completed' });
  }

  // Eliminar tarea
  async deleteTask(taskId: number) {
    await db.delete(tasks).where(eq(tasks.id, taskId));
    broadcast('task:deleted', { task_id: taskId });
    return { ok: true };
  }

  // Obtener tareas de un usuario
  async getUserTasks(userId: number, filters?: {
    status?: string;
    priority?: string;
    contactId?: number;
    dueBefore?: Date;
    dueAfter?: Date;
  }) {
    const conditions = [eq(tasks.assignedTo, userId)];

    if (filters?.status) conditions.push(eq(tasks.status, filters.status as any));
    if (filters?.priority) conditions.push(eq(tasks.priority, filters.priority as any));
    if (filters?.contactId) conditions.push(eq(tasks.contactId, filters.contactId));
    if (filters?.dueBefore) conditions.push(lte(tasks.dueDate, filters.dueBefore));
    if (filters?.dueAfter) conditions.push(gte(tasks.dueDate, filters.dueAfter));

    const result = await db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(tasks.dueDate);

    return result.map(this.serializeTask);
  }

  // Obtener tareas vencidas
  async getOverdueTasks() {
    const now = new Date();
    const result = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'pending'),
          lte(tasks.dueDate, now)
        )
      )
      .orderBy(tasks.dueDate);

    return result.map(this.serializeTask);
  }

  // Actualizar tareas vencidas (cron job)
  async markOverdueTasks() {
    const now = new Date();
    await db
      .update(tasks)
      .set({ status: 'overdue', updatedAt: now })
      .where(
        and(
          eq(tasks.status, 'pending'),
          lte(tasks.dueDate, now)
        )
      );
  }

  // Obtener ocupación del usuario
  async getUserBusyness(userId: number): Promise<number> {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedTo, userId),
          eq(tasks.status, 'pending'),
          gte(tasks.dueDate, now),
          lte(tasks.dueDate, nextWeek)
        )
      );

    return result?.count ?? 0;
  }

  // Serializar tarea
  serializeTask(task: typeof tasks.$inferSelect) {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      status: task.status,
      priority: task.priority,
      contact_id: task.contactId,
      conversation_id: task.conversationId,
      assigned_to: task.assignedTo,
      created_by: task.createdBy,
      due_date: task.dueDate.toISOString(),
      started_at: task.startedAt?.toISOString() ?? null,
      completed_at: task.completedAt?.toISOString() ?? null,
      location: task.location,
      attendees: task.attendees,
      reminder_minutes_before: task.reminderMinutesBefore,
      is_recurring: task.isRecurring,
      recurrence_rule: task.recurrenceRule,
      created_at: task.createdAt.toISOString(),
      updated_at: task.updatedAt.toISOString(),
    };
  }
}

export const taskService = new TaskService();
