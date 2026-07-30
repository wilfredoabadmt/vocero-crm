import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  daysSince,
  normalizeServiceStatus,
  toIsoDate,
  toMoney,
  UNKNOWN_ACCOUNT,
  type AccountSnapshot,
} from "@/server/ai/account-context";

export * from "@/server/ai/account-context";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠️  ESTA ES LA ÚNICA FRONTERA DE INTEGRACIÓN CON TU DOMINIO.             ║
 * ║ Las 4 queries marcadas con ⚠️ ADAPTAR usan nombres de tabla y columna    ║
 * ║ supuestos (subscriber, plan, invoice, payment, ticket). Cámbialos por    ║
 * ║ los tuyos y el resto del agente funciona sin tocar una línea más.        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

/**
 * Resuelve el estado de cuenta a partir del teléfono del contacto.
 *
 * Contrato: NUNCA lanza. Si algo falla (tabla ausente, abonado no encontrado),
 * devuelve `UNKNOWN_ACCOUNT` y el prompt le dice al agente que no tiene datos.
 * Un error de dominio no debe tumbar el turno.
 */
export async function getAccountSnapshot(input: {
  organizationId: string;
  /** Teléfono normalizado del contacto de WhatsApp (E.164 sin '+'). */
  phone: string;
}): Promise<AccountSnapshot> {
  try {
    return await loadSnapshot(input);
  } catch (err) {
    console.error("[agente] estado de cuenta no disponible:", err);
    return UNKNOWN_ACCOUNT;
  }
}

async function loadSnapshot(input: {
  organizationId: string;
  phone: string;
}): Promise<AccountSnapshot> {
  const db = getDb();
  const { organizationId } = input;

  // ── 1/4 ⚠️ ADAPTAR: abonado por teléfono ──────────────────────────────────
  // Si guardas varios teléfonos por abonado, cambia el eq() por un OR sobre
  // tu tabla de teléfonos.
  const subs = await db
    .select({
      id: schema.subscriber.id,
      name: schema.subscriber.name,
      code: schema.subscriber.code,
      status: schema.subscriber.status,
      planName: schema.plan.name,
      planPrice: schema.plan.price,
      cutoffAt: schema.subscriber.nextCutoffAt,
    })
    .from(schema.subscriber)
    .leftJoin(schema.plan, eq(schema.subscriber.planId, schema.plan.id))
    .where(
      scoped(
        schema.subscriber.organizationId,
        organizationId,
        eq(schema.subscriber.phone, input.phone)
      )
    )
    .limit(1);

  const sub = subs[0];
  if (!sub) return UNKNOWN_ACCOUNT;

  // ── 2/4 ⚠️ ADAPTAR: facturas vencidas ─────────────────────────────────────
  const overdue = await db
    .select({
      total: sql<string>`coalesce(sum(${schema.invoice.amount}), 0)`,
      oldestDue: sql<string | null>`min(${schema.invoice.dueDate})`,
    })
    .from(schema.invoice)
    .where(
      scoped(
        schema.invoice.organizationId,
        organizationId,
        and(
          eq(schema.invoice.subscriberId, sub.id),
          inArray(schema.invoice.status, ["pendiente", "vencida"]),
          sql`${schema.invoice.dueDate} < current_date`
        )
      )
    );

  const saldo = toMoney(overdue[0]?.total ?? "0");
  const diasVencido = daysSince(overdue[0]?.oldestDue ?? null);

  // ── 3/4 ⚠️ ADAPTAR: último pago ───────────────────────────────────────────
  const pagos = await db
    .select({ amount: schema.payment.amount, paidAt: schema.payment.paidAt })
    .from(schema.payment)
    .where(
      scoped(
        schema.payment.organizationId,
        organizationId,
        eq(schema.payment.subscriberId, sub.id)
      )
    )
    .orderBy(desc(schema.payment.paidAt))
    .limit(1);

  // ── 4/4 ⚠️ ADAPTAR: tickets abiertos ──────────────────────────────────────
  const tickets = await db
    .select({
      id: schema.ticket.id,
      category: schema.ticket.category,
      status: schema.ticket.status,
      createdAt: schema.ticket.createdAt,
    })
    .from(schema.ticket)
    .where(
      scoped(
        schema.ticket.organizationId,
        organizationId,
        and(
          eq(schema.ticket.subscriberId, sub.id),
          inArray(schema.ticket.status, ["abierto", "en_proceso", "asignado"])
        )
      )
    )
    .orderBy(desc(schema.ticket.createdAt))
    .limit(5);

  // ── Tablas propias del agente (no requieren adaptación) ───────────────────
  const promesas = await db
    .select({
      promisedFor: schema.paymentPromise.promisedFor,
      amount: schema.paymentPromise.amount,
    })
    .from(schema.paymentPromise)
    .where(
      scoped(
        schema.paymentPromise.organizationId,
        organizationId,
        and(
          eq(schema.paymentPromise.subscriberId, sub.id),
          eq(schema.paymentPromise.status, "pendiente")
        )
      )
    )
    .limit(1);

  const recibos = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.paymentReceipt)
    .where(
      scoped(
        schema.paymentReceipt.organizationId,
        organizationId,
        and(
          eq(schema.paymentReceipt.subscriberId, sub.id),
          eq(schema.paymentReceipt.status, "en_revision")
        )
      )
    );

  const pago = pagos[0];
  const promesa = promesas[0];

  return {
    found: true,
    subscriberId: sub.id,
    nombre: sub.name,
    codigoCliente: sub.code ?? null,
    plan: sub.planName
      ? { nombre: sub.planName, precio: sub.planPrice ?? null }
      : null,
    estadoServicio: normalizeServiceStatus(sub.status),
    saldoVencido: saldo,
    moneda: process.env.BILLING_CURRENCY?.trim() || "MXN",
    diasVencido,
    fechaCorte: toIsoDate(sub.cutoffAt),
    ultimoPago:
      pago && pago.paidAt
        ? { fecha: toIsoDate(pago.paidAt) ?? "", monto: toMoney(pago.amount) }
        : null,
    promesaVigente: promesa
      ? {
          fecha: String(promesa.promisedFor),
          monto: promesa.amount ? toMoney(promesa.amount) : null,
        }
      : null,
    ticketsAbiertos: tickets.map((t) => ({
      id: t.id,
      categoria: String(t.category),
      estado: String(t.status),
      abiertoEl: toIsoDate(t.createdAt) ?? "",
    })),
    comprobantesEnRevision: recibos[0]?.n ?? 0,
  };
}
