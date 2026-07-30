import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  resolveTicketCategory,
  validatePromiseDate,
  type AgentActionType,
} from "@/server/ai/actions";

/**
 * EJECUTORES de las acciones con efecto secundario.
 *
 * Contrato de todos: devuelven `{ ok }` — NUNCA lanzan. Si la validación falla
 * o la BD se queja, el pipeline degrada la acción a un `reply` y el abonado
 * recibe una respuesta útil en vez de silencio.
 *
 * ⚠️ ADAPTAR: `execCrearTicket` escribe en TU tabla de tickets.
 */

export type ExecResult =
  | { ok: true; detail?: string }
  | { ok: false; reason: string };

type Ctx = {
  organizationId: string;
  conversationId: string;
  subscriberId: string;
  /** Perfil de la organización: capacidades y límites. */
  profile: {
    allowPaymentPromise: boolean;
    allowTicketCreation: boolean;
    allowReceiptCapture: boolean;
    maxPromiseDays: number;
  };
};

/* -------------------------------------------------------------------------- */
/* Promesa de pago                                                             */
/* -------------------------------------------------------------------------- */

export async function execRegistrarPromesa(
  ctx: Ctx,
  action: Extract<AgentActionType, { action: "registrar_promesa_pago" }>
): Promise<ExecResult> {
  if (!ctx.profile.allowPaymentPromise) {
    return { ok: false, reason: "capacidad deshabilitada" };
  }

  const date = validatePromiseDate(action.fecha, {
    maxDays: ctx.profile.maxPromiseDays,
  });
  if (!date.ok) return { ok: false, reason: `fecha ${date.reason}` };

  if (action.monto !== undefined && action.monto > 1_000_000) {
    return { ok: false, reason: "monto fuera de rango" };
  }

  try {
    const db = getDb();
    // Idempotencia: una sola promesa pendiente por abonado. Si ya existe, se
    // actualiza la fecha en vez de crear una segunda (índice único parcial).
    const existing = await db
      .select({ id: schema.paymentPromise.id })
      .from(schema.paymentPromise)
      .where(
        scoped(
          schema.paymentPromise.organizationId,
          ctx.organizationId,
          and(
            eq(schema.paymentPromise.subscriberId, ctx.subscriberId),
            eq(schema.paymentPromise.status, "pendiente")
          )
        )
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(schema.paymentPromise)
        .set({
          promisedFor: date.date,
          amount: action.monto?.toFixed(2) ?? null,
          conversationId: ctx.conversationId,
          updatedAt: new Date(),
        })
        .where(eq(schema.paymentPromise.id, existing[0].id));
      return { ok: true, detail: "promesa actualizada" };
    }

    await db.insert(schema.paymentPromise).values({
      id: newId("paymentPromise"),
      organizationId: ctx.organizationId,
      subscriberId: ctx.subscriberId,
      conversationId: ctx.conversationId,
      promisedFor: date.date,
      amount: action.monto?.toFixed(2) ?? null,
      status: "pendiente",
      source: "ia",
    });
    return { ok: true, detail: "promesa registrada" };
  } catch (err) {
    console.error("[agente] no se pudo registrar la promesa:", err);
    return { ok: false, reason: "error de base de datos" };
  }
}

/* -------------------------------------------------------------------------- */
/* Ticket de soporte                                                           */
/* -------------------------------------------------------------------------- */

export async function execCrearTicket(
  ctx: Ctx,
  action: Extract<AgentActionType, { action: "crear_ticket" }>
): Promise<ExecResult> {
  if (!ctx.profile.allowTicketCreation) {
    return { ok: false, reason: "capacidad deshabilitada" };
  }

  const categoria = resolveTicketCategory(action.categoria);
  if (!categoria) return { ok: false, reason: "categoría no permitida" };

  try {
    const db = getDb();

    // Anti-duplicado: si ya hay un ticket abierto de la misma categoría en las
    // últimas 24h, no se crea otro (el prompt también lo desalienta).
    const dupSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dup = await db
      .select({ id: schema.ticket.id })
      .from(schema.ticket)
      .where(
        scoped(
          schema.ticket.organizationId,
          ctx.organizationId,
          and(
            eq(schema.ticket.subscriberId, ctx.subscriberId),
            eq(schema.ticket.category, categoria)
          )
        )
      )
      .orderBy(desc(schema.ticket.createdAt))
      .limit(1);
    if (dup[0]) {
      const recent = await db
        .select({ createdAt: schema.ticket.createdAt })
        .from(schema.ticket)
        .where(eq(schema.ticket.id, dup[0].id))
        .limit(1);
      const created = recent[0]?.createdAt;
      if (created && created > dupSince) {
        return { ok: true, detail: `ticket existente ${dup[0].id}` };
      }
    }

    // ⚠️ ADAPTAR: columnas de TU tabla de tickets.
    await db.insert(schema.ticket).values({
      id: newId("ticket"),
      organizationId: ctx.organizationId,
      subscriberId: ctx.subscriberId,
      category: categoria,
      status: "abierto",
      priority: categoria === "sin_servicio" ? "alta" : "normal",
      description: `[IA] ${action.descripcion}`,
      source: "whatsapp_ia",
    });
    return { ok: true, detail: "ticket creado" };
  } catch (err) {
    console.error("[agente] no se pudo crear el ticket:", err);
    return { ok: false, reason: "error de base de datos" };
  }
}

/* -------------------------------------------------------------------------- */
/* Comprobante de pago                                                         */
/* -------------------------------------------------------------------------- */

export async function execRegistrarComprobante(
  ctx: Ctx,
  action: Extract<AgentActionType, { action: "registrar_comprobante" }>,
  /** Mensaje entrante de tipo imagen/documento más reciente, si lo hay. */
  mediaMessage: { id: string; mediaId: string | null } | null
): Promise<ExecResult> {
  if (!ctx.profile.allowReceiptCapture) {
    return { ok: false, reason: "capacidad deshabilitada" };
  }
  // Sin imagen reciente no hay comprobante que registrar: el modelo alucinó.
  if (!mediaMessage) return { ok: false, reason: "sin imagen reciente" };

  try {
    const db = getDb();
    await db
      .insert(schema.paymentReceipt)
      .values({
        id: newId("paymentReceipt"),
        organizationId: ctx.organizationId,
        subscriberId: ctx.subscriberId,
        conversationId: ctx.conversationId,
        messageId: mediaMessage.id,
        storageKey: mediaMessage.mediaId,
        declaredAmount: action.monto?.toFixed(2) ?? null,
        reference: action.referencia ?? null,
        // El agente NUNCA aprueba: queda para revisión humana.
        status: "en_revision",
      })
      // Idempotencia: un mensaje entrante genera como máximo un comprobante.
      .onConflictDoNothing({ target: schema.paymentReceipt.messageId });
    return { ok: true, detail: "comprobante en revisión" };
  } catch (err) {
    console.error("[agente] no se pudo registrar el comprobante:", err);
    return { ok: false, reason: "error de base de datos" };
  }
}

/* -------------------------------------------------------------------------- */
/* Nota en el expediente                                                       */
/* -------------------------------------------------------------------------- */

export async function execNotaAbonado(
  ctx: Ctx,
  action: Extract<AgentActionType, { action: "nota_abonado" }>
): Promise<ExecResult> {
  try {
    const db = getDb();
    // ⚠️ ADAPTAR: columna de notas de TU tabla de abonados.
    const rows = await db
      .select({ id: schema.subscriber.id, notes: schema.subscriber.notes })
      .from(schema.subscriber)
      .where(
        scoped(
          schema.subscriber.organizationId,
          ctx.organizationId,
          eq(schema.subscriber.id, ctx.subscriberId)
        )
      )
      .limit(1);
    const sub = rows[0];
    if (!sub) return { ok: false, reason: "abonado no encontrado" };

    const stamped = `[IA ${new Date().toISOString().slice(0, 10)}] ${action.note}`;
    await db
      .update(schema.subscriber)
      .set({
        notes: sub.notes ? `${sub.notes}\n${stamped}` : stamped,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriber.id, sub.id));
    return { ok: true };
  } catch (err) {
    console.error("[agente] no se pudo guardar la nota:", err);
    return { ok: false, reason: "error de base de datos" };
  }
}
