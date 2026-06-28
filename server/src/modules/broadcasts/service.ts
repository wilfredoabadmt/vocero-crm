import { and, eq, sql, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  broadcastCampaigns,
  broadcastRecipients,
  contacts,
  conversations,
  contactTags,
  messages,
  templates,
  inboxes,
} from '../../db/schema.js';
import { config, decryptSecret } from '../../config.js';
import { getGraphClient } from '../../integrations/whatsapp/index.js';
import { broadcast } from '../../realtime/hub.js';
import { emitEvent } from '../../lib/events.js';

const BROADCAST_LIMITS = {
  maxRecipientsPerCampaign: 10000,
  maxConcurrentCampaigns: 3,
  rateLimitPerSecond: 50,
  retryAttempts: 3,
  retryDelayMs: 5000,
};

export class BroadcastService {
  // Obtener estadísticas de una campaña
  async getCampaignStats(campaignId: number) {
    const [stats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        sent: sql<number>`count(*) filter (where status = 'sent')::int`,
        delivered: sql<number>`count(*) filter (where status = 'delivered')::int`,
        read: sql<number>`count(*) filter (where status = 'read')::int`,
        failed: sql<number>`count(*) filter (where status = 'failed')::int`,
        replied: sql<number>`count(*) filter (where status = 'replied')::int`,
      })
      .from(broadcastRecipients)
      .where(eq(broadcastRecipients.campaignId, campaignId));

    return stats;
  }

  // Ejecutar envío de campaña con rate limiting
  async executeCampaignWithRateLimit(campaignId: number): Promise<void> {
    const [campaign] = await db.select().from(broadcastCampaigns).where(eq(broadcastCampaigns.id, campaignId));
    if (!campaign) throw new Error('Campaña no encontrada');

    // Verificar límites concurrentes
    const [activeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(broadcastCampaigns)
      .where(eq(broadcastCampaigns.status, 'sending'));

    if ((activeCount?.count ?? 0) >= BROADCAST_LIMITS.maxConcurrentCampaigns) {
      throw new Error('Límite de campañas concurrentes alcanzado');
    }

    // Obtener destinatarios pendientes
    const recipients = await db
      .select()
      .from(broadcastRecipients)
      .where(
        and(
          eq(broadcastRecipients.campaignId, campaignId),
          eq(broadcastRecipients.status, 'pending')
        )
      )
      .orderBy(broadcastRecipients.id);

    if (recipients.length === 0) {
      await this.completeCampaign(campaignId);
      return;
    }

    // Obtener token de la bandeja
    const [inbox] = await db.select().from(inboxes).where(eq(inboxes.id, campaign.inboxId));
    if (!inbox || inbox.status !== 'connected') {
      throw new Error('Bandeja no conectada');
    }

    const token = config.SIMULATION_MODE ? '' : inbox.accessTokenEnc ? decryptSecret(inbox.accessTokenEnc) : '';

    // Obtener template
    const [template] = await db.select().from(templates).where(eq(templates.id, campaign.templateId!));
    if (!template) throw new Error('Plantilla no encontrada');

    let sentCount = 0;
    let failedCount = 0;

    // Enviar con rate limiting
    for (const recipient of recipients) {
      try {
        // Rate limiting: esperar entre envíos
        if (sentCount > 0 && sentCount % BROADCAST_LIMITS.rateLimitPerSecond === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Obtener contacto para el número de teléfono
        const [contact] = await db.select().from(contacts).where(eq(contacts.id, recipient.contactId));
        if (!contact) {
          await this.markRecipientFailed(recipient.id, 'Contacto no encontrado');
          failedCount++;
          continue;
        }

        // Enviar mensaje via WhatsApp API
        const wamid = await this.sendTemplateMessage(
          token,
          inbox.wabaId ?? '',
          template,
          contact.waId
        );

        // Actualizar destinatario
        await db
          .update(broadcastRecipients)
          .set({
            status: 'sent',
            wamid,
            sentAt: new Date(),
          })
          .where(eq(broadcastRecipients.id, recipient.id));

        sentCount++;

        // Broadcast progreso
        broadcast('broadcast:recipient_update', {
          campaign_id: campaignId,
          contact_id: recipient.contactId,
          status: 'sent',
          wamid,
        });
      } catch (error) {
        failedCount++;
        await this.markRecipientFailed(
          recipient.id,
          error instanceof Error ? error.message : 'Error desconocido'
        );
      }
    }

    // Actualizar contadores de la campaña
    await db
      .update(broadcastCampaigns)
      .set({
        sentCount: campaign.sentCount + sentCount,
        failedCount: campaign.failedCount + failedCount,
      })
      .where(eq(broadcastCampaigns.id, campaignId));
  }

  // Enviar mensaje de plantilla
  private async sendTemplateMessage(
    token: string,
    wabaId: string,
    template: typeof templates.$inferSelect,
    toPhoneNumber: string
  ): Promise<string> {
    // En modo simulación, retornar un ID ficticio
    if (config.SIMULATION_MODE) {
      return `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    const graphClient = getGraphClient();
    const result = await graphClient.sendTemplate(token, wabaId, toPhoneNumber, template.name, template.language, []);

    return result.wamid;
  }

  // Marcar destinatario como fallido
  private async markRecipientFailed(recipientId: number, errorMessage: string) {
    await db
      .update(broadcastRecipients)
      .set({
        status: 'failed',
        errorMessage,
      })
      .where(eq(broadcastRecipients.id, recipientId));
  }

  // Completar campaña
  private async completeCampaign(campaignId: number) {
    await db
      .update(broadcastCampaigns)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(broadcastCampaigns.id, campaignId));

    broadcast('broadcast:status_changed', {
      campaign_id: campaignId,
      status: 'completed',
    });
  }

  // Actualizar estado de destinatario desde webhook
  async updateRecipientStatus(wamid: string, status: string) {
    const [recipient] = await db
      .select()
      .from(broadcastRecipients)
      .where(eq(broadcastRecipients.wamid, wamid));

    if (!recipient) return;

    const statusMap: Record<string, typeof recipient.status> = {
      sent: 'sent',
      delivered: 'delivered',
      read: 'read',
      failed: 'failed',
    };

    const newStatus = statusMap[status] ?? recipient.status;
    const updates: Partial<typeof broadcastRecipients.$inferInsert> = { status: newStatus };

    if (status === 'delivered') updates.deliveredAt = new Date();
    if (status === 'read') updates.readAt = new Date();

    await db.update(broadcastRecipients).set(updates).where(eq(broadcastRecipients.id, recipient.id));

    // Broadcast actualización
    broadcast('broadcast:recipient_update', {
      campaign_id: recipient.campaignId,
      contact_id: recipient.contactId,
      status: newStatus,
    });
  }

  // Obtener métricas de campaña para analytics
  async getCampaignAnalytics(campaignId: number) {
    const stats = await this.getCampaignStats(campaignId);
    const [campaign] = await db.select().from(broadcastCampaigns).where(eq(broadcastCampaigns.id, campaignId));

    return {
      campaign: campaign ? {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        created_at: campaign.createdAt.toISOString(),
        started_at: campaign.startedAt?.toISOString(),
        completed_at: campaign.completedAt?.toISOString(),
      } : null,
      stats,
      rates: {
        delivery_rate: (stats?.total ?? 0) > 0 ? (((stats?.delivered ?? 0) / (stats?.total ?? 1)) * 100).toFixed(2) : '0',
        read_rate: (stats?.total ?? 0) > 0 ? (((stats?.read ?? 0) / (stats?.total ?? 1)) * 100).toFixed(2) : '0',
        failure_rate: (stats?.total ?? 0) > 0 ? (((stats?.failed ?? 0) / (stats?.total ?? 1)) * 100).toFixed(2) : '0',
        reply_rate: (stats?.total ?? 0) > 0 ? (((stats?.replied ?? 0) / (stats?.total ?? 1)) * 100).toFixed(2) : '0',
      },
    };
  }
}

export const broadcastService = new BroadcastService();
