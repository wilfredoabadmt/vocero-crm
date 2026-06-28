import { and, eq, sql, asc, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  assignmentRules,
  assignmentRuleAgents,
  contacts,
  conversations,
  users,
  contactTags,
} from '../../db/schema.js';
import { broadcast } from '../../realtime/hub.js';

export class AssignmentService {
  // Asignar contacto a un agente basado en reglas activas
  async assignContact(contactId: number, inboxId: number): Promise<number | null> {
    // 1. Buscar reglas activas para la bandeja (ordenadas por prioridad)
    const rules = await db
      .select()
      .from(assignmentRules)
      .where(
        and(
          eq(assignmentRules.isActive, true),
          sql`(${assignmentRules.inboxId} = ${inboxId} OR ${assignmentRules.inboxId} IS NULL)`
        )
      )
      .orderBy(desc(assignmentRules.priority));

    if (rules.length === 0) return null;

    // 2. Obtener el contacto
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
    if (!contact) return null;

    // 3. Evaluar cada regla hasta encontrar una que aplique
    for (const rule of rules) {
      if (await this.evaluateRule(rule, contact)) {
        const assignedUserId = await this.selectAgent(rule, contact);
        if (assignedUserId) {
          // 4. Asignar contacto
          await db
            .update(conversations)
            .set({
              assignedAgentId: assignedUserId,
              autoReply: 'active',
            })
            .where(eq(conversations.contactId, contactId));

          // 5. Broadcast notificación
          broadcast('lead:assigned', {
            contact_id: contactId,
            assigned_to: assignedUserId,
            rule_id: rule.id,
          });

          return assignedUserId;
        }
      }
    }

    return null;
  }

  // Evaluar si una regla aplica para un contacto
  private async evaluateRule(
    rule: typeof assignmentRules.$inferSelect,
    contact: typeof contacts.$inferSelect
  ): Promise<boolean> {
    // Filtro por etapa
    if (rule.filterStageId && contact.stageId !== rule.filterStageId) {
      return false;
    }

    // Filtro por score mínimo
    if (rule.filterMinScore && (contact.leadScoring ?? 0) < rule.filterMinScore) {
      return false;
    }

    // Filtro por etiquetas
    if (rule.filterTagIds && rule.filterTagIds.length > 0) {
      const contactTagIds = await db
        .select({ tagId: contactTags.tagId })
        .from(contactTags)
        .where(eq(contactTags.contactId, contact.id));

      const tagIds = contactTagIds.map((r) => r.tagId);
      const hasMatchingTag = rule.filterTagIds.some((id) => tagIds.includes(id));
      if (!hasMatchingTag) return false;
    }

    // Filtro por horario laboral
    if (rule.filterBusinessHours) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentDay = now.getDay(); // 0=domingo, 1=lunes, etc.

      if (
        currentHour < (rule.workingHoursStart ?? 9) ||
        currentHour >= (rule.workingHoursEnd ?? 18)
      ) {
        return false;
      }

      const workingDays = (rule.workingDays as number[]) ?? [1, 2, 3, 4, 5];
      if (!workingDays.includes(currentDay)) {
        return false;
      }
    }

    return true;
  }

  // Seleccionar agente según el modo de la regla
  private async selectAgent(
    rule: typeof assignmentRules.$inferSelect,
    contact: typeof contacts.$inferSelect
  ): Promise<number | null> {
    // Obtener agentes asignados a la regla
    const ruleAgents = await db
      .select()
      .from(assignmentRuleAgents)
      .where(eq(assignmentRuleAgents.ruleId, rule.id))
      .orderBy(asc(assignmentRuleAgents.createdAt));

    if (ruleAgents.length === 0) return null;

    // Obtener usuarios activos
    const userIds = ruleAgents.map((ra) => ra.userId);
    const activeUsers = await db
      .select()
      .from(users)
      .where(and(eq(users.isActive, true), sql`${users.id} IN ${userIds}`));

    if (activeUsers.length === 0) return null;

    switch (rule.mode) {
      case 'round_robin':
        return this.roundRobinSelect(ruleAgents, activeUsers);
      case 'random':
        return this.randomSelect(activeUsers);
      case 'least_loaded':
        return this.leastLoadedSelect(activeUsers);
      case 'weighted':
        return this.weightedSelect(ruleAgents, activeUsers);
      case 'manual':
        return null; // No auto-asignar
      default:
        return this.roundRobinSelect(ruleAgents, activeUsers);
    }
  }

  // Round-robin: siguiente en la lista (circular)
  private async roundRobinSelect(
    ruleAgents: typeof assignmentRuleAgents.$inferSelect[],
    activeUsers: typeof users.$inferSelect[]
  ): Promise<number | null> {
    if (ruleAgents.length === 0 || activeUsers.length === 0) return null;

    // Encontrar el último agente asignado (simular con el último conversation assigned)
    const [lastAssigned] = await db
      .select({ assignedAgentId: conversations.assignedAgentId })
      .from(conversations)
      .where(sql`${conversations.assignedAgentId} IS NOT NULL`)
      .orderBy(desc(conversations.id))
      .limit(1);

    const lastAgentId = lastAssigned?.assignedAgentId;
    const activeUserIds = new Set(activeUsers.map((u) => u.id));

    // Encontrar el siguiente agente activo después del último asignado
    const validAgents = ruleAgents.filter((ra) => activeUserIds.has(ra.userId));
    if (validAgents.length === 0) return null;

    if (!lastAgentId) {
      return validAgents[0]!.userId;
    }

    const currentIndex = validAgents.findIndex((ra) => ra.userId === lastAgentId);
    const nextIndex = (currentIndex + 1) % validAgents.length;
    return validAgents[nextIndex]!.userId;
  }

  // Random: aleatorio entre disponibles
  private randomSelect(activeUsers: typeof users.$inferSelect[]): number | null {
    if (activeUsers.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * activeUsers.length);
    return activeUsers[randomIndex]!.id;
  }

  // Least loaded: menor número de leads activos
  private async leastLoadedSelect(activeUsers: typeof users.$inferSelect[]): Promise<number | null> {
    if (activeUsers.length === 0) return null;

    const userIds = activeUsers.map((u) => u.id);
    const [result] = await db
      .select({
        userId: conversations.assignedAgentId,
        count: sql<number>`count(*)::int`,
      })
      .from(conversations)
      .where(
        and(
          sql`${conversations.assignedAgentId} IN ${userIds}`,
          eq(conversations.needsHuman, false)
        )
      )
      .groupBy(conversations.assignedAgentId);

    // Encontrar el usuario con menos leads (incluyendo los que no tienen leads)
    const loadMap = new Map<number, number>();
    if (result) loadMap.set(result.userId!, result.count);

    let minLoad = Infinity;
    let selectedUserId: number | null = null;

    for (const user of activeUsers) {
      const load = loadMap.get(user.id) ?? 0;
      if (load < minLoad) {
        minLoad = load;
        selectedUserId = user.id;
      }
    }

    return selectedUserId;
  }

  // Weighted: probabilístico según peso
  private weightedSelect(
    ruleAgents: typeof assignmentRuleAgents.$inferSelect[],
    activeUsers: typeof users.$inferSelect[]
  ): number | null {
    if (ruleAgents.length === 0 || activeUsers.length === 0) return null;

    const activeUserIds = new Set(activeUsers.map((u) => u.id));
    const validAgents = ruleAgents.filter((ra) => activeUserIds.has(ra.userId));
    if (validAgents.length === 0) return null;

    const totalWeight = validAgents.reduce((sum, ra) => sum + ra.weight, 0);
    let random = Math.random() * totalWeight;

    for (const agent of validAgents) {
      random -= agent.weight;
      if (random <= 0) {
        return agent.userId;
      }
    }

    return validAgents[0]!.userId;
  }

  // Obtener carga de trabajo por agente
  async getAgentWorkloads(): Promise<Array<{ userId: number; activeLeads: number; name: string }>> {
    const [result] = await db
      .select({
        userId: conversations.assignedAgentId,
        count: sql<number>`count(*)::int`,
      })
      .from(conversations)
      .where(sql`${conversations.assignedAgentId} IS NOT NULL`)
      .groupBy(conversations.assignedAgentId);

    // Obtener todos los usuarios activos
    const activeUsers = await db.select().from(users).where(eq(users.isActive, true));

    const loadMap = new Map<number, number>();
    if (result) loadMap.set(result.userId!, result.count);

    return activeUsers.map((user) => ({
      userId: user.id,
      activeLeads: loadMap.get(user.id) ?? 0,
      name: user.name,
    }));
  }

  // Verificar si un agente está dentro de horario laboral
  async isWithinWorkingHours(userId: number): Promise<boolean> {
    // Buscar reglas que incluyan al agente
    const rules = await db
      .select()
      .from(assignmentRules)
      .innerJoin(assignmentRuleAgents, eq(assignmentRuleAgents.ruleId, assignmentRules.id))
      .where(
        and(
          eq(assignmentRules.isActive, true),
          eq(assignmentRules.filterBusinessHours, true),
          eq(assignmentRuleAgents.userId, userId)
        )
      );

    if (rules.length === 0) return true; // Sin restricción de horario

    const rule = rules[0]!.assignment_rules;
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    if (
      currentHour < (rule.workingHoursStart ?? 9) ||
      currentHour >= (rule.workingHoursEnd ?? 18)
    ) {
      return false;
    }

    const workingDays = (rule.workingDays as number[]) ?? [1, 2, 3, 4, 5];
    return workingDays.includes(currentDay);
  }
}

export const assignmentService = new AssignmentService();
