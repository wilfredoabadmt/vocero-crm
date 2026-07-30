/**
 * ESTADO DE CUENTA — tipos y render. Archivo PURO: no importa la BD ni la red,
 * así que se puede testear con Vitest sin levantar Postgres.
 *
 * Las queries que lo llenan viven en `account.ts` (esa sí toca tu schema).
 *
 * Por qué inyectar el estado de cuenta en el prompt en vez de darle al modelo
 * una "acción de consulta": si el modelo tuviera que pedir el saldo, habría dos
 * llamadas por turno y, peor, una ventana donde puede inventar la cifra
 * mientras "espera". Al inyectarlo, las cifras del prompt son la única fuente
 * numérica posible y la regla "no inventes números" se vuelve verificable.
 */

export type ServiceStatus =
  | "activo"
  | "suspendido"
  | "cortado"
  | "baja"
  | "desconocido";

export type OpenTicket = {
  id: string;
  categoria: string;
  estado: string;
  abiertoEl: string; // YYYY-MM-DD
};

export type AccountSnapshot = {
  /** false = el teléfono no corresponde a ningún abonado de esta organización. */
  found: boolean;
  subscriberId: string | null;
  nombre: string | null;
  codigoCliente: string | null;
  plan: { nombre: string; precio: string | null } | null;
  estadoServicio: ServiceStatus;
  /** Suma de facturas vencidas, como string con 2 decimales ("1250.00"). */
  saldoVencido: string;
  moneda: string;
  /** Días desde el vencimiento más antiguo sin pagar. 0 si no debe. */
  diasVencido: number;
  /** Próxima fecha de corte programada (YYYY-MM-DD). */
  fechaCorte: string | null;
  ultimoPago: { fecha: string; monto: string } | null;
  promesaVigente: { fecha: string; monto: string | null } | null;
  ticketsAbiertos: OpenTicket[];
  comprobantesEnRevision: number;
};

export const UNKNOWN_ACCOUNT: AccountSnapshot = {
  found: false,
  subscriberId: null,
  nombre: null,
  codigoCliente: null,
  plan: null,
  estadoServicio: "desconocido",
  saldoVencido: "0.00",
  moneda: "MXN",
  diasVencido: 0,
  fechaCorte: null,
  ultimoPago: null,
  promesaVigente: null,
  ticketsAbiertos: [],
  comprobantesEnRevision: 0,
};

/* -------------------------------------------------------------------------- */
/* Render del contexto                                                         */
/* -------------------------------------------------------------------------- */

const STATUS_LABEL: Record<ServiceStatus, string> = {
  activo: "ACTIVO (navegando con normalidad)",
  suspendido: "SUSPENDIDO temporalmente",
  cortado: "CORTADO por falta de pago",
  baja: "DADO DE BAJA",
  desconocido: "DESCONOCIDO",
};

/**
 * Convierte el snapshot en el bloque de texto que ve el modelo.
 * Formato plano y etiquetado: los modelos lo citan mejor que un JSON.
 */
export function renderAccountContext(a: AccountSnapshot): string {
  if (!a.found) {
    return [
      "ESTADO DE CUENTA: NO IDENTIFICADO.",
      "Este número de WhatsApp no está asociado a ningún abonado registrado.",
      "NO tienes datos de cuenta: no afirmes saldos, fechas ni estados.",
      "Pide el número de cliente o el nombre del titular, y escala a un humano si insiste.",
    ].join("\n");
  }

  const lines: string[] = [
    "ESTADO DE CUENTA (datos verificados del sistema — ÚNICA fuente de cifras):",
    `- Titular: ${a.nombre ?? "(sin nombre)"}${a.codigoCliente ? ` · Cliente #${a.codigoCliente}` : ""}`,
    `- Servicio: ${STATUS_LABEL[a.estadoServicio]}`,
  ];

  if (a.plan) {
    lines.push(
      `- Plan: ${a.plan.nombre}${a.plan.precio ? ` (${money(a.plan.precio, a.moneda)}/mes)` : ""}`
    );
  }

  if (Number(a.saldoVencido) > 0) {
    lines.push(
      `- Saldo VENCIDO: ${money(a.saldoVencido, a.moneda)} (${a.diasVencido} día(s) de atraso)`
    );
  } else {
    lines.push("- Saldo vencido: NINGUNO. La cuenta está al corriente.");
  }

  if (a.fechaCorte) lines.push(`- Fecha de corte programada: ${a.fechaCorte}`);

  lines.push(
    a.ultimoPago
      ? `- Último pago registrado: ${money(a.ultimoPago.monto, a.moneda)} el ${a.ultimoPago.fecha}`
      : "- Último pago registrado: ninguno"
  );

  if (a.promesaVigente) {
    lines.push(
      `- PROMESA DE PAGO VIGENTE para el ${a.promesaVigente.fecha}` +
        (a.promesaVigente.monto
          ? ` por ${money(a.promesaVigente.monto, a.moneda)}`
          : "") +
        ". NO registres otra promesa: recuérdale la que ya tiene."
    );
  }

  if (a.comprobantesEnRevision > 0) {
    lines.push(
      `- Comprobantes EN REVISIÓN: ${a.comprobantesEnRevision}. Ya los recibimos y el equipo los está validando. NO pidas otro comprobante ni confirmes que el pago fue aplicado.`
    );
  }

  if (a.ticketsAbiertos.length > 0) {
    lines.push("- Tickets ABIERTOS (no crees uno duplicado):");
    for (const t of a.ticketsAbiertos) {
      lines.push(
        `  · #${t.id} — ${t.categoria} — ${t.estado} — abierto el ${t.abiertoEl}`
      );
    }
  } else {
    lines.push("- Tickets abiertos: ninguno");
  }

  return lines.join("\n");
}

function money(value: string, currency: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return `${value} ${currency}`;
  return `$${n.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

/* -------------------------------------------------------------------------- */
/* Helpers puros                                                               */
/* -------------------------------------------------------------------------- */

/** ⚠️ ADAPTAR: mapea los estados de TU tabla de abonados a los canónicos. */
export function normalizeServiceStatus(raw: string | null): ServiceStatus {
  const v = (raw ?? "").trim().toLowerCase();
  if (["activo", "active", "conectado", "online"].includes(v)) return "activo";
  if (["suspendido", "suspended", "pausado"].includes(v)) return "suspendido";
  if (["cortado", "cut", "cortado_mora", "moroso", "desconectado"].includes(v)) {
    return "cortado";
  }
  if (["baja", "cancelado", "inactive", "terminado"].includes(v)) return "baja";
  return "desconocido";
}

export function toMoney(value: string | number | null): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

export function toIsoDate(value: Date | string | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function daysSince(
  isoDate: string | null,
  now: Date = new Date()
): number {
  if (!isoDate) return 0;
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return 0;
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  return Math.max(0, Math.round((todayUtc - d.getTime()) / 86_400_000));
}
