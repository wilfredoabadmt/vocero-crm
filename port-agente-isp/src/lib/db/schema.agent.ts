import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Tablas del Agente de IA para el CRM de cobranza ISP.
 *
 * CÓMO INTEGRAR: pega este contenido dentro de tu `src/lib/db/schema.ts`
 * (o impórtalo y re-expórtalo desde ahí) y ajusta las referencias marcadas
 * con ⚠️ ADAPTAR a tus tablas reales.
 *
 * Multi-tenancy: `organization_id` NOT NULL en TODA tabla; ninguna query se
 * escribe sin `scoped()`.
 */

// ⚠️ ADAPTAR: importa tus tablas reales en lugar de estas declaraciones.
//   import { organization, conversation, subscriber, message } from "./schema";
// Se declaran aquí sólo para que el archivo sea legible de forma aislada.
declare const organization: { id: never };
declare const conversation: { id: never };
declare const subscriber: { id: never };
declare const message: { id: never };

/* -------------------------------------------------------------------------- */
/* Perfil del agente: uno por organización                                     */
/* -------------------------------------------------------------------------- */

export const agentProfile = pgTable(
  "agent_profile",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),

    /** Interruptor global del agente para conversaciones reales. */
    enabled: boolean("enabled").notNull().default(false),

    name: text("name").notNull().default("Asistente"),
    tone: text("tone"),
    instructions: text("instructions"),
    escalationRules: text("escalation_rules"),
    greeting: text("greeting"),

    /** Instrucciones de pago que el agente puede dictar textualmente. */
    paymentInstructions: text("payment_instructions"),

    /* --- Capacidades: qué acciones con efecto secundario puede tomar --- */
    allowPaymentPromise: boolean("allow_payment_promise").notNull().default(true),
    allowTicketCreation: boolean("allow_ticket_creation").notNull().default(true),
    allowReceiptCapture: boolean("allow_receipt_capture").notNull().default(true),

    /** Días hacia adelante como máximo para una promesa de pago. */
    maxPromiseDays: integer("max_promise_days").notNull().default(7),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_profile_org_uq").on(t.organizationId)]
);

/* -------------------------------------------------------------------------- */
/* Knowledge base: la única fuente de verdad de POLÍTICAS del agente           */
/* -------------------------------------------------------------------------- */

export const kbEntry = pgTable(
  "kb_entry",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["qa", "block"] }).notNull(),
    question: text("question"),
    answer: text("answer"),
    content: text("content"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("kb_org_idx").on(t.organizationId)]
);

/* -------------------------------------------------------------------------- */
/* Promesa de pago: compromiso de fecha registrado por el agente               */
/* -------------------------------------------------------------------------- */

export const paymentPromise = pgTable(
  "payment_promise",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // ⚠️ ADAPTAR: nombre real de tu tabla de abonados.
    subscriberId: text("subscriber_id")
      .notNull()
      .references(() => subscriber.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),

    /** Fecha comprometida (no la de creación). */
    promisedFor: date("promised_for").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }),

    status: text("status", {
      enum: ["pendiente", "cumplida", "incumplida", "cancelada"],
    })
      .notNull()
      .default("pendiente"),

    /** Quién la registró: el agente o una persona del equipo. */
    source: text("source", { enum: ["ia", "humano"] }).notNull().default("ia"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("payment_promise_org_sub_idx").on(t.organizationId, t.subscriberId),
    // Una sola promesa pendiente por abonado: re-ejecutar el flujo no duplica.
    uniqueIndex("payment_promise_active_uq")
      .on(t.organizationId, t.subscriberId)
      .where(sql`${t.status} = 'pendiente'`),
  ]
);

/* -------------------------------------------------------------------------- */
/* Comprobante de pago: imagen recibida por WhatsApp, pendiente de validar     */
/* -------------------------------------------------------------------------- */

export const paymentReceipt = pgTable(
  "payment_receipt",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    subscriberId: text("subscriber_id")
      .notNull()
      .references(() => subscriber.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    /** Mensaje entrante (imagen) que originó el comprobante. */
    messageId: text("message_id").references(() => message.id, {
      onDelete: "set null",
    }),

    /** Clave en tu almacenamiento (S3) o media_id de Meta si aún no se baja. */
    storageKey: text("storage_key"),
    declaredAmount: numeric("declared_amount", { precision: 12, scale: 2 }),
    reference: text("reference"),

    /**
     * El agente JAMÁS aprueba un pago: sólo lo deja `en_revision`.
     * La aprobación (y por tanto la reconexión) es una decisión humana.
     */
    status: text("status", {
      enum: ["en_revision", "aprobado", "rechazado"],
    })
      .notNull()
      .default("en_revision"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("payment_receipt_org_status_idx").on(t.organizationId, t.status),
    // Idempotencia: un mensaje entrante genera como máximo un comprobante.
    uniqueIndex("payment_receipt_message_uq").on(t.messageId),
  ]
);

/* -------------------------------------------------------------------------- */
/* Columnas que hay que AÑADIR a tu tabla `conversation` existente             */
/* -------------------------------------------------------------------------- */

/*
  aiEnabled:     boolean("ai_enabled").notNull().default(true)
  handoffAt:     timestamp("handoff_at")
  handoffReason: text("handoff_reason", {
                   enum: ["cliente", "modelo", "error", "ventana", "retencion", "legal"],
                 })
  isTest:        boolean("is_test").notNull().default(false)
  lastInboundAt: timestamp("last_inbound_at")   // si aún no la tienes

  Ver la migración SQL en drizzle/0001_agente_isp.sql (idempotente).
*/
