import { sql, eq, and, gte, lte, desc, count, countDistinct } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  contacts,
  conversations,
  messages,
  stages,
  users,
  conversionEvents,
  dailyMetrics,
} from '../../db/schema.js';

export class AnalyticsService {
  // Dashboard principal mejorado
  async getDashboard(dateRange: { from: Date; to: Date }) {
    const [leadsByStage, messagesVolume, aiVsHuman, avgResponseTime, topAgents, conversionFunnel] =
      await Promise.all([
        this.getLeadsByStage(),
        this.getMessagesVolume(dateRange),
        this.getAiVsHuman(dateRange),
        this.getAvgResponseTime(dateRange),
        this.getTopAgents(dateRange),
        this.getConversionFunnel(dateRange),
      ]);

    return {
      leadsByStage,
      messagesVolume,
      aiVsHuman,
      avgResponseTimeSeconds: avgResponseTime,
      topAgents,
      conversionFunnel,
    };
  }

  // Leads por etapa
  private async getLeadsByStage() {
    const result = await db
      .select({
        stageId: stages.id,
        stageName: stages.name,
        count: count(contacts.id),
      })
      .from(stages)
      .leftJoin(contacts, eq(contacts.stageId, stages.id))
      .groupBy(stages.id, stages.name)
      .orderBy(stages.position);

    return result.map((s) => ({
      id: s.stageId,
      name: s.stageName,
      count: Number(s.count),
    }));
  }

  // Volumen de mensajes por día
  private async getMessagesVolume(dateRange: { from: Date; to: Date }) {
    const result = await db.execute<{ date: string; direction: string; count: number }>(sql`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM-DD') as date,
        direction,
        count(*)::int as count
      FROM messages
      WHERE created_at >= ${dateRange.from}::timestamptz AND created_at <= ${dateRange.to}::timestamptz
      GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD'), direction
      ORDER BY date ASC
    `);

    return Array.isArray(result) ? result : (result as any).rows || [];
  }

  // IA vs Human
  private async getAiVsHuman(dateRange: { from: Date; to: Date }) {
    const result = await db
      .select({
        authorType: messages.authorType,
        count: count(messages.id),
      })
      .from(messages)
      .where(
        and(
          eq(messages.direction, 'out'),
          gte(messages.createdAt, dateRange.from),
          lte(messages.createdAt, dateRange.to)
        )
      )
      .groupBy(messages.authorType);

    return result.map((h) => ({
      authorType: h.authorType,
      count: Number(h.count),
    }));
  }

  // Tiempo promedio de respuesta
  private async getAvgResponseTime(dateRange: { from: Date; to: Date }): Promise<number> {
    const result = await db.execute<{ avg_seconds: number }>(sql`
      SELECT COALESCE(AVG(t.diff_seconds), 0)::float as avg_seconds
      FROM (
        SELECT 
          EXTRACT(EPOCH FROM (m.created_at - LAG(m.created_at) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at))) as diff_seconds,
          m.direction as current_dir,
          LAG(m.direction) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) as prev_dir,
          m.created_at
        FROM messages m
      ) t
      WHERE t.current_dir = 'out' AND t.prev_dir = 'in' 
        AND t.created_at >= ${dateRange.from}::timestamptz AND t.created_at <= ${dateRange.to}::timestamptz
    `);

    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    return Math.round(Number(rows[0]?.avg_seconds || 0));
  }

  // Top agentes por rendimiento
  async getTopAgents(dateRange: { from: Date; to: Date }) {
    const result = await db
      .select({
        userId: messages.authorUserId,
        userName: users.name,
        messageCount: count(messages.id),
      })
      .from(messages)
      .innerJoin(users, eq(messages.authorUserId, users.id))
      .where(
        and(
          eq(messages.direction, 'out'),
          gte(messages.createdAt, dateRange.from),
          lte(messages.createdAt, dateRange.to)
        )
      )
      .groupBy(messages.authorUserId, users.name)
      .orderBy(desc(count(messages.id)))
      .limit(10);

    return result.map((a) => ({
      userId: a.userId,
      userName: a.userName,
      messageCount: Number(a.messageCount),
    }));
  }

  // Scorecard de agente individual
  async getAgentScorecard(userId: number, dateRange: { from: Date; to: Date }) {
    const [totalLeadsAssigned, leadsConverted, messagesHandled, avgResponseTime] = await Promise.all([
      // Leads asignados
      db
        .select({ count: count(contacts.id) })
        .from(contacts)
        .where(
          and(
            eq(contacts.assignedTo, userId),
            gte(contacts.createdAt, dateRange.from),
            lte(contacts.createdAt, dateRange.to)
          )
        )
        .then((r) => Number(r[0]?.count || 0)),

      // Leads convertidos (cambiaron de etapa)
      db
        .select({ count: count(conversionEvents.id) })
        .from(conversionEvents)
        .where(
          and(
            eq(conversionEvents.userId, userId),
            gte(conversionEvents.createdAt, dateRange.from),
            lte(conversionEvents.createdAt, dateRange.to)
          )
        )
        .then((r) => Number(r[0]?.count || 0)),

      // Mensajes manejados
      db
        .select({ count: count(messages.id) })
        .from(messages)
        .where(
          and(
            eq(messages.authorUserId, userId),
            eq(messages.direction, 'out'),
            gte(messages.createdAt, dateRange.from),
            lte(messages.createdAt, dateRange.to)
          )
        )
        .then((r) => Number(r[0]?.count || 0)),

      // Tiempo promedio de respuesta
      db.execute<{ avg_seconds: number }>(sql`
        SELECT COALESCE(AVG(t.diff_seconds), 0)::float as avg_seconds
        FROM (
          SELECT 
            EXTRACT(EPOCH FROM (m.created_at - LAG(m.created_at) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at))) as diff_seconds,
            m.direction as current_dir,
            LAG(m.direction) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) as prev_dir,
            m.created_at
          FROM messages m
          WHERE m.author_user_id = ${userId}
        ) t
        WHERE t.current_dir = 'out' AND t.prev_dir = 'in'
          AND t.created_at >= ${dateRange.from}::timestamptz AND t.created_at <= ${dateRange.to}::timestamptz
      `).then((r) => {
        const rows = Array.isArray(r) ? r : (r as any).rows || [];
        return Math.round(Number(rows[0]?.avg_seconds || 0));
      }),
    ]);

    return {
      totalLeadsAssigned,
      leadsConverted,
      conversionRate: totalLeadsAssigned > 0 ? ((leadsConverted / totalLeadsAssigned) * 100).toFixed(1) : '0',
      messagesHandled,
      avgResponseTimeMinutes: Math.round(avgResponseTime / 60),
    };
  }

  // Análisis por fuente de leads
  async getSourceAnalytics(dateRange: { from: Date; to: Date }) {
    const result = await db
      .select({
        source: contacts.source,
        totalLeads: count(contacts.id),
      })
      .from(contacts)
      .where(
        and(
          gte(contacts.createdAt, dateRange.from),
          lte(contacts.createdAt, dateRange.to)
        )
      )
      .groupBy(contacts.source);

    const totalLeads = result.reduce((sum, r) => sum + Number(r.totalLeads), 0);

    return result.map((r) => ({
      source: r.source || 'organic',
      totalLeads: Number(r.totalLeads),
      percentage: totalLeads > 0 ? ((Number(r.totalLeads) / totalLeads) * 100).toFixed(1) : '0',
    }));
  }

  // Embudo de conversión
  private async getConversionFunnel(dateRange: { from: Date; to: Date }) {
    const allStages = await db.select().from(stages).orderBy(stages.position);
    const result = await db
      .select({
        stageId: contacts.stageId,
        count: count(contacts.id),
      })
      .from(contacts)
      .where(
        and(
          gte(contacts.createdAt, dateRange.from),
          lte(contacts.createdAt, dateRange.to)
        )
      )
      .groupBy(contacts.stageId);

    const stageMap = new Map(result.map((r) => [r.stageId, Number(r.count)]));

    return allStages.map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      count: stageMap.get(stage.id) ?? 0,
    }));
  }

  // Registrar evento de conversión
  async trackConversion(
    contactId: number,
    fromStageId: number | null,
    toStageId: number,
    triggeredBy: string,
    userId?: number
  ) {
    await db.insert(conversionEvents).values({
      contactId,
      fromStageId,
      toStageId,
      triggeredBy,
      userId,
    });
  }

  // Actualizar métricas diarias (ejecutar via cron cada día)
  async updateDailyMetrics(date: Date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const [totalLeads, newLeads, totalMessages, inboundMessages, outboundMessages, aiResponses, humanResponses] =
      await Promise.all([
        db.select({ count: count(contacts.id) }).from(contacts).where(lte(contacts.createdAt, dayEnd)).then((r) => Number(r[0]?.count || 0)),
        db.select({ count: count(contacts.id) }).from(contacts).where(and(gte(contacts.createdAt, dayStart), lte(contacts.createdAt, dayEnd))).then((r) => Number(r[0]?.count || 0)),
        db.select({ count: count(messages.id) }).from(messages).where(and(gte(messages.createdAt, dayStart), lte(messages.createdAt, dayEnd))).then((r) => Number(r[0]?.count || 0)),
        db.select({ count: count(messages.id) }).from(messages).where(and(eq(messages.direction, 'in'), gte(messages.createdAt, dayStart), lte(messages.createdAt, dayEnd))).then((r) => Number(r[0]?.count || 0)),
        db.select({ count: count(messages.id) }).from(messages).where(and(eq(messages.direction, 'out'), gte(messages.createdAt, dayStart), lte(messages.createdAt, dayEnd))).then((r) => Number(r[0]?.count || 0)),
        db.select({ count: count(messages.id) }).from(messages).where(and(eq(messages.direction, 'out'), eq(messages.authorType, 'ai_agent'), gte(messages.createdAt, dayStart), lte(messages.createdAt, dayEnd))).then((r) => Number(r[0]?.count || 0)),
        db.select({ count: count(messages.id) }).from(messages).where(and(eq(messages.direction, 'out'), eq(messages.authorType, 'user'), gte(messages.createdAt, dayStart), lte(messages.createdAt, dayEnd))).then((r) => Number(r[0]?.count || 0)),
      ]);

    await db
      .insert(dailyMetrics)
      .values({
        date: dayStart,
        totalLeads,
        newLeads,
        convertedLeads: 0,
        totalMessages,
        inboundMessages,
        outboundMessages,
        aiResponses,
        humanResponses,
      })
      .onConflictDoUpdate({
        target: dailyMetrics.date,
        set: {
          totalLeads,
          newLeads,
          totalMessages,
          inboundMessages,
          outboundMessages,
          aiResponses,
          humanResponses,
        },
      });
  }
}

export const analyticsService = new AnalyticsService();
