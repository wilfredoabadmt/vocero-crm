import { and, eq, lte, sql, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  alertRules,
  leadAlerts,
  contacts,
  conversations,
  users,
  stages,
} from '../../db/schema.js';
import { broadcast } from '../../realtime/hub.js';

export class AlertEngine {
  // Evaluar todas las reglas activas y generar alertas
  async evaluateRules(): Promise<{ alertsCreated: number }> {
    const activeRules = await db
      .select()
      .from(alertRules)
      .where(eq(alertRules.isActive, true));

    let alertsCreated = 0;

    for (const rule of activeRules) {
      const newAlerts = await this.evaluateRule(rule);
      alertsCreated += newAlerts;
    }

    return { alertsCreated };
  }

  // Evaluar una regla individual
  private async evaluateRule(rule: typeof alertRules.$inferSelect): Promise<number> {
    const thresholdDate = new Date(Date.now() - rule.thresholdHours * 60 * 60 * 1000);

    // Construir condiciones de filtro
    const conditions = [
      eq(contacts.stageId, sql`COALESCE(${rule.filterStageId}, ${contacts.stageId})`),
      lte(contacts.lastActivityAt, thresholdDate),
    ];

    if (rule.filterAssignedTo) {
      conditions.push(eq(contacts.assignedTo, rule.filterAssignedTo));
    }

    // Buscar contactos que cumplen la condición
    const staleContacts = await db
      .select({
        contact: contacts,
        conversation: conversations,
      })
      .from(contacts)
      .leftJoin(conversations, eq(contacts.id, conversations.contactId))
      .where(and(...conditions));

    // Filtrar contactos que ya tienen alerta pendiente para esta regla
    const existingAlerts = await db
      .select({ contactId: leadAlerts.contactId })
      .from(leadAlerts)
      .where(
        and(
          eq(leadAlerts.ruleId, rule.id),
          eq(leadAlerts.status, 'pending')
        )
      );

    const existingContactIds = new Set(existingAlerts.map((a) => a.contactId));
    const newContacts = staleContacts.filter(
      (sc) => !existingContactIds.has(sc.contact.id)
    );

    // Crear alertas
    for (const { contact, conversation } of newContacts) {
      const message = this.generateAlertMessage(rule, contact);

      const [alert] = await db
        .insert(leadAlerts)
        .values({
          ruleId: rule.id,
          contactId: contact.id,
          conversationId: conversation?.id ?? null,
          assignedTo: contact.assignedTo,
          message,
          metadata: {
            contactName: contact.name,
            contactWaId: contact.waId,
            lastActivityAt: contact.lastActivityAt?.toISOString(),
          },
        })
        .returning();

      if (alert) {
        broadcast('alert:new', {
          alert_id: alert.id,
          contact_id: contact.id,
          rule_id: rule.id,
        });
      }
    }

    return newContacts.length;
  }

  // Generar mensaje de alerta
  private generateAlertMessage(
    rule: typeof alertRules.$inferSelect,
    contact: typeof contacts.$inferSelect
  ): string {
    if (rule.messageTemplate) {
      return rule.messageTemplate
        .replace('{contact_name}', contact.name ?? 'Sin nombre')
        .replace('{threshold_hours}', rule.thresholdHours.toString())
        .replace('{last_activity}', contact.lastActivityAt?.toLocaleString('es-ES') ?? 'Nunca');
    }

    const contactName = contact.name ?? contact.waId;
    switch (rule.type) {
      case 'stale_lead':
        return `Lead inactivo: ${contactName} sin actividad por ${rule.thresholdHours}h`;
      case 'no_response':
        return `Sin respuesta: ${contactName} no ha respondido en ${rule.thresholdHours}h`;
      case 'stage_stuck':
        return `Lead estancado: ${contactName} en el mismo estado por ${rule.thresholdHours}h`;
      default:
        return `Alerta para ${contactName}: ${rule.name}`;
    }
  }

  // Obtener alertas del usuario
  async getUserAlerts(userId: number) {
    return db
      .select({
        id: leadAlerts.id,
        ruleId: leadAlerts.ruleId,
        contactId: leadAlerts.contactId,
        conversationId: leadAlerts.conversationId,
        status: leadAlerts.status,
        message: leadAlerts.message,
        acknowledgedAt: leadAlerts.acknowledgedAt,
        resolvedAt: leadAlerts.resolvedAt,
        createdAt: leadAlerts.createdAt,
        contactName: contacts.name,
        contactWaId: contacts.waId,
        ruleName: alertRules.name,
        ruleType: alertRules.type,
      })
      .from(leadAlerts)
      .innerJoin(alertRules, eq(leadAlerts.ruleId, alertRules.id))
      .innerJoin(contacts, eq(leadAlerts.contactId, contacts.id))
      .where(
        and(
          eq(leadAlerts.assignedTo, userId),
          eq(leadAlerts.status, 'pending')
        )
      )
      .orderBy(leadAlerts.createdAt);
  }

  // Obtener conteo de alertas pendientes
  async getAlertCount(userId: number): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leadAlerts)
      .where(
        and(
          eq(leadAlerts.assignedTo, userId),
          eq(leadAlerts.status, 'pending')
        )
      );

    return result?.count ?? 0;
  }

  // Marcar alerta como reconocida
  async acknowledgeAlert(alertId: number, userId: number) {
    const [updated] = await db
      .update(leadAlerts)
      .set({
        status: 'acknowledged',
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
      })
      .where(eq(leadAlerts.id, alertId))
      .returning();

    if (updated) {
      broadcast('alert:updated', { alert_id: updated.id, status: 'acknowledged' });
    }

    return updated ?? null;
  }

  // Marcar alerta como resuelta
  async resolveAlert(alertId: number, userId: number) {
    const [updated] = await db
      .update(leadAlerts)
      .set({
        status: 'resolved',
        resolvedBy: userId,
        resolvedAt: new Date(),
      })
      .where(eq(leadAlerts.id, alertId))
      .returning();

    if (updated) {
      broadcast('alert:updated', { alert_id: updated.id, status: 'resolved' });
    }

    return updated ?? null;
  }

  // Descartar alerta
  async dismissAlert(alertId: number) {
    const [updated] = await db
      .update(leadAlerts)
      .set({ status: 'dismissed' })
      .where(eq(leadAlerts.id, alertId))
      .returning();

    if (updated) {
      broadcast('alert:updated', { alert_id: updated.id, status: 'dismissed' });
    }

    return updated ?? null;
  }

  // Crear regla de alerta
  async createRule(data: {
    name: string;
    type: string;
    thresholdHours: number;
    filterStageId?: number;
    filterTagIds?: number[];
    filterAssignedTo?: number;
    actions: string[];
    notifyUserIds?: number[];
    messageTemplate?: string;
    createdBy: number;
  }) {
    const [rule] = await db
      .insert(alertRules)
      .values({
        name: data.name,
        type: data.type as any,
        thresholdHours: data.thresholdHours,
        filterStageId: data.filterStageId,
        filterTagIds: data.filterTagIds ?? [],
        filterAssignedTo: data.filterAssignedTo,
        actions: data.actions,
        notifyUserIds: data.notifyUserIds ?? [],
        messageTemplate: data.messageTemplate,
        createdBy: data.createdBy,
      })
      .returning();

    broadcast('alert:rule_created', { rule_id: rule!.id });
    return rule!;
  }

  // Actualizar regla de alerta
  async updateRule(ruleId: number, data: Partial<{
    name: string;
    type: string;
    isActive: boolean;
    thresholdHours: number;
    filterStageId: number | null;
    filterTagIds: number[];
    filterAssignedTo: number | null;
    actions: string[];
    notifyUserIds: number[];
    messageTemplate: string | null;
  }>) {
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.type !== undefined) updates.type = data.type;
    if (data.isActive !== undefined) updates.isActive = data.isActive;
    if (data.thresholdHours !== undefined) updates.thresholdHours = data.thresholdHours;
    if (data.filterStageId !== undefined) updates.filterStageId = data.filterStageId;
    if (data.filterTagIds !== undefined) updates.filterTagIds = data.filterTagIds;
    if (data.filterAssignedTo !== undefined) updates.filterAssignedTo = data.filterAssignedTo;
    if (data.actions !== undefined) updates.actions = data.actions;
    if (data.notifyUserIds !== undefined) updates.notifyUserIds = data.notifyUserIds;
    if (data.messageTemplate !== undefined) updates.messageTemplate = data.messageTemplate;

    const [updated] = await db
      .update(alertRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(alertRules.id, ruleId))
      .returning();

    if (updated) {
      broadcast('alert:rule_updated', { rule_id: updated.id });
    }

    return updated ?? null;
  }

  // Eliminar regla de alerta
  async deleteRule(ruleId: number) {
    await db.delete(alertRules).where(eq(alertRules.id, ruleId));
    broadcast('alert:rule_deleted', { rule_id: ruleId });
    return { ok: true };
  }

  // Obtener todas las reglas
  async getRules() {
    return db.select().from(alertRules).orderBy(alertRules.name);
  }
}

export const alertEngine = new AlertEngine();
