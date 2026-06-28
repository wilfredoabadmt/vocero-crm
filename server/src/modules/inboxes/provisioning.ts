import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config, encryptSecret } from '../../config.js';
import { db } from '../../db/client.js';
import { inboxes } from '../../db/schema.js';
import { unauthorized } from '../../lib/errors.js';
import { broadcast } from '../../realtime/hub.js';

function checkBearer(header: string | undefined) {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const expected = config.PROVISIONING_SECRET;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw unauthorized('Credencial de provisioning inválida');
  }
}

const provisioningBody = z.object({
  waba_id: z.string().min(1),
  phone_number_id: z.string().min(1),
  display_phone_number: z.string().min(1),
  access_token: z.string().min(1),
  business_name: z.string().optional(),
  // Nombre de la bandeja que se está onboardeando (el `client` que el panel
  // envió a la URL del embedded). Permite onboardear varios números a la vez.
  client: z.string().optional(),
});

export type ProvisioningInput = z.infer<typeof provisioningBody>;

/** Núcleo del provisioning (lo reutiliza el endpoint de simulación). */
export async function provisionInbox(input: ProvisioningInput) {
  const tokenEnc = encryptSecret(input.access_token);
  const now = new Date();

  // 1) Si ya existe una bandeja con ese número ⇒ actualizar credenciales (reintentos idempotentes)
  const [existing] = await db.select().from(inboxes).where(eq(inboxes.phoneNumberId, input.phone_number_id));
  let inbox: typeof inboxes.$inferSelect;
  if (existing) {
    inbox = (
      await db
        .update(inboxes)
        .set({
          wabaId: input.waba_id,
          displayPhoneNumber: input.display_phone_number,
          accessTokenEnc: tokenEnc,
          status: 'connected',
          lastError: null,
          connectedAt: now,
        })
        .where(eq(inboxes.id, existing.id))
        .returning()
    )[0]!;
  } else {
    // 2) Completar la bandeja `pending` que corresponda. Si llega `client`
    //    (nombre de la bandeja), se busca por nombre; si no, la más reciente.
    const pendingConds = [eq(inboxes.status, 'pending'), isNull(inboxes.phoneNumberId)];
    if (input.client) pendingConds.push(eq(inboxes.name, input.client));
    const [pending] = await db
      .select()
      .from(inboxes)
      .where(and(...pendingConds))
      .orderBy(desc(inboxes.id))
      .limit(1);
    if (pending) {
      inbox = (
        await db
          .update(inboxes)
          .set({
            wabaId: input.waba_id,
            phoneNumberId: input.phone_number_id,
            displayPhoneNumber: input.display_phone_number,
            accessTokenEnc: tokenEnc,
            status: 'connected',
            lastError: null,
            connectedAt: now,
          })
          .where(eq(inboxes.id, pending.id))
          .returning()
      )[0]!;
    } else {
      // 3) Crear una nueva
      inbox = (
        await db
          .insert(inboxes)
          .values({
            name: input.client || input.business_name || `WhatsApp ${input.display_phone_number}`,
            wabaId: input.waba_id,
            phoneNumberId: input.phone_number_id,
            displayPhoneNumber: input.display_phone_number,
            accessTokenEnc: tokenEnc,
            status: 'connected',
            connectedAt: now,
          })
          .returning()
      )[0]!;
    }
  }

  broadcast('inbox:status_changed', { inbox_id: inbox.id, status: 'connected', last_error: null });
  return inbox;
}

export function provisioningRoutes(app: FastifyInstance) {
  app.post('/api/provisioning/whatsapp', async (request) => {
    checkBearer(request.headers.authorization);
    const input = provisioningBody.parse(request.body);
    const inbox = await provisionInbox(input);
    return { ok: true, inbox_id: inbox.id };
  });
}

/** Bandejas `pending` sin credenciales por más de 10 min ⇒ `failed` (la UI ofrece reintentar). */
export async function sweepStalePendingInboxes() {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const stale = await db
    .update(inboxes)
    .set({ status: 'failed', lastError: 'No se recibieron credenciales del onboarding (expiró la espera)' })
    .where(and(eq(inboxes.status, 'pending'), isNull(inboxes.phoneNumberId), lt(inboxes.createdAt, cutoff)))
    .returning();
  for (const inbox of stale) {
    broadcast('inbox:status_changed', { inbox_id: inbox.id, status: 'failed', last_error: inbox.lastError });
  }
}
