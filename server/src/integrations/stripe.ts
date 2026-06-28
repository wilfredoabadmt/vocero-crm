import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Verifica si la suscripción o licencia de uso del SaaS está activa.
 * Utiliza la tabla de configuraciones generales 'settings' como almacenamiento persistente de licencia.
 */
export async function isSubscriptionActive(): Promise<boolean> {
  try {
    const [statusSetting] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, 'stripe_subscription_status'));

    // Si no está declarada (primer inicio), por defecto la marcamos activa
    if (!statusSetting) {
      await db.insert(settings).values({ key: 'stripe_subscription_status', value: 'active' });
      return true;
    }

    return statusSetting.value === 'active';
  } catch (err) {
    console.error('[Stripe] Error consultando estado de suscripción:', err);
    return true; // Fallback tolerante en desarrollo
  }
}

/**
 * Registra las rutas de webhook para recibir notificaciones de eventos de Stripe de forma simulada
 */
export function stripeRoutes(app: FastifyInstance) {
  // Webhook simulado para actualizar la suscripción
  app.post('/api/integrations/stripe/webhook', async (request, reply) => {
    const payload = request.body as { event: string; status: 'active' | 'inactive' | 'past_due' };

    console.log(`[Stripe Webhook] Recibido evento simulado: "${payload.event}" con estatus: "${payload.status}"`);

    if (payload.status) {
      await db
        .insert(settings)
        .values({ key: 'stripe_subscription_status', value: payload.status })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: payload.status, updatedAt: new Date() },
        });

      return { processed: true, new_status: payload.status };
    }

    reply.code(400);
    return { error: 'Payload inválido' };
  });

  // Endpoint para consultar el estado de la suscripción (usado en la interfaz de Ajustes)
  app.get('/api/integrations/stripe/status', async () => {
    const active = await isSubscriptionActive();
    return { active, status: active ? 'active' : 'inactive' };
  });
}
