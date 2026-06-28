import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  contacts,
  conversations,
  messages,
  stages,
  users,
  tags,
  contactTags,
  tasks,
} from '../../db/schema.js';

export interface ExportOptions {
  format: 'csv' | 'json';
  type: 'contacts' | 'conversations' | 'tasks';
  filters?: {
    stageId?: number;
    assignedTo?: number;
    tagIds?: number[];
    dateFrom?: string;
    dateTo?: string;
  };
}

export class ExportService {
  async exportData(options: ExportOptions, userId: number) {
    switch (options.type) {
      case 'contacts':
        return this.exportContacts(options, userId);
      case 'conversations':
        return this.exportConversations(options, userId);
      case 'tasks':
        return this.exportTasks(options, userId);
      default:
        throw new Error('Tipo de exportación no válido');
    }
  }

  private async exportContacts(options: ExportOptions, userId: number) {
    const conditions = [];

    if (options.filters?.stageId) {
      conditions.push(eq(contacts.stageId, options.filters.stageId));
    }
    if (options.filters?.assignedTo) {
      conditions.push(eq(contacts.assignedTo, options.filters.assignedTo));
    }

    const contactList = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        wa_id: contacts.waId,
        phone: contacts.phone,
        source: contacts.source,
        lead_scoring: contacts.leadScoring,
        stage_id: contacts.stageId,
        assigned_to: contacts.assignedTo,
        created_at: contacts.createdAt,
        last_activity_at: contacts.lastActivityAt,
      })
      .from(contacts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(contacts.createdAt);

    // Enriquecer con nombres
    const enriched = await Promise.all(
      contactList.map(async (c) => {
        const [stage] = await db.select().from(stages).where(eq(stages.id, c.stage_id));
        const [agent] = c.assigned_to
          ? await db.select().from(users).where(eq(users.id, c.assigned_to))
          : [undefined];
        return {
          ...c,
          stage_name: stage?.name ?? 'Sin etapa',
          agent_name: agent?.name ?? 'Sin asignar',
        };
      })
    );

    return {
      data: enriched,
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Nombre' },
        { key: 'wa_id', label: 'WhatsApp ID' },
        { key: 'phone', label: 'Teléfono' },
        { key: 'source', label: 'Fuente' },
        { key: 'lead_scoring', label: 'Score' },
        { key: 'stage_name', label: 'Etapa' },
        { key: 'agent_name', label: 'Agente' },
        { key: 'created_at', label: 'Creado' },
        { key: 'last_activity_at', label: 'Última actividad' },
      ],
      filename: `contactos_${new Date().toISOString().split('T')[0]}`,
    };
  }

  private async exportConversations(options: ExportOptions, userId: number) {
    const conditions = [];

    if (options.filters?.dateFrom) {
      conditions.push(sql`${conversations.createdAt} >= ${new Date(options.filters.dateFrom)}`);
    }
    if (options.filters?.dateTo) {
      conditions.push(sql`${conversations.createdAt} <= ${new Date(options.filters.dateTo)}`);
    }

    const conversationList = await db
      .select({
        id: conversations.id,
        contact_id: conversations.contactId,
        last_message_at: conversations.lastMessageAt,
        last_message_preview: conversations.lastMessagePreview,
        unread_count: conversations.unreadCount,
        needs_human: conversations.needsHuman,
        created_at: conversations.createdAt,
      })
      .from(conversations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(conversations.lastMessageAt);

    // Enriquecer con contactos
    const enriched = await Promise.all(
      conversationList.map(async (c) => {
        const [contact] = await db.select().from(contacts).where(eq(contacts.id, c.contact_id));
        return {
          ...c,
          contact_name: contact?.name ?? 'Sin nombre',
          contact_wa_id: contact?.waId ?? '',
        };
      })
    );

    return {
      data: enriched,
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'contact_name', label: 'Contacto' },
        { key: 'contact_wa_id', label: 'WhatsApp ID' },
        { key: 'last_message_preview', label: 'Último mensaje' },
        { key: 'unread_count', label: 'No leídos' },
        { key: 'needs_human', label: 'Requiere humano' },
        { key: 'created_at', label: 'Creado' },
        { key: 'last_message_at', label: 'Última actividad' },
      ],
      filename: `conversaciones_${new Date().toISOString().split('T')[0]}`,
    };
  }

  private async exportTasks(options: ExportOptions, userId: number) {
    const conditions = [eq(tasks.assignedTo, userId)];

    if (options.filters?.dateFrom) {
      conditions.push(sql`${tasks.createdAt} >= ${new Date(options.filters.dateFrom)}`);
    }
    if (options.filters?.dateTo) {
      conditions.push(sql`${tasks.createdAt} <= ${new Date(options.filters.dateTo)}`);
    }

    const taskList = await db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(tasks.dueDate);

    return {
      data: taskList.map((t) => ({
        id: t.id,
        title: t.title,
        type: t.type,
        status: t.status,
        priority: t.priority,
        due_date: t.dueDate,
        created_at: t.createdAt,
        completed_at: t.completedAt,
      })),
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'title', label: 'Título' },
        { key: 'type', label: 'Tipo' },
        { key: 'status', label: 'Estado' },
        { key: 'priority', label: 'Prioridad' },
        { key: 'due_date', label: 'Vencimiento' },
        { key: 'created_at', label: 'Creado' },
        { key: 'completed_at', label: 'Completado' },
      ],
      filename: `tareas_${new Date().toISOString().split('T')[0]}`,
    };
  }

  // Convertir a CSV
  toCSV(data: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
    const headers = columns.map((c) => c.label).join(',');
    const rows = data.map((row) =>
      columns
        .map((c) => {
          const value = row[c.key];
          if (value === null || value === undefined) return '';
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          if (typeof value === 'object') return `"${JSON.stringify(value)}"`;
          return String(value);
        })
        .join(',')
    );
    return [headers, ...rows].join('\n');
  }

  // Convertir a JSON
  toJSON(data: Record<string, unknown>[]): string {
    return JSON.stringify(data, null, 2);
  }
}

export const exportService = new ExportService();
