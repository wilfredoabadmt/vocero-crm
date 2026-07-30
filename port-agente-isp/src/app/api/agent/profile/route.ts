import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { isAiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

/**
 * Perfil del agente de la organización.
 *
 * `withAuth` debe resolver la sesión y exponer `session.organizationId`.
 * Si tu helper se llama distinto, cámbialo aquí: el resto no depende de él.
 */

export const GET = withAuth(async (session) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.agentProfile)
    .where(scoped(schema.agentProfile.organizationId, session.organizationId))
    .limit(1);

  // Auto-provisión: una organización sin perfil recibe uno apagado.
  // Re-ejecutable: si otro request lo creó primero, el índice único lo absorbe.
  let p = rows[0];
  if (!p) {
    const created = await db
      .insert(schema.agentProfile)
      .values({
        id: newId("agentProfile"),
        organizationId: session.organizationId,
        enabled: false,
      })
      .onConflictDoNothing({ target: schema.agentProfile.organizationId })
      .returning();
    p =
      created[0] ??
      (
        await db
          .select()
          .from(schema.agentProfile)
          .where(
            scoped(schema.agentProfile.organizationId, session.organizationId)
          )
          .limit(1)
      )[0];
  }
  if (!p) return apiError(500, "internal", "No se pudo crear el perfil");

  return Response.json({
    profile: {
      enabled: p.enabled,
      name: p.name,
      tone: p.tone,
      instructions: p.instructions,
      escalationRules: p.escalationRules,
      greeting: p.greeting,
      paymentInstructions: p.paymentInstructions,
      allowPaymentPromise: p.allowPaymentPromise,
      allowTicketCreation: p.allowTicketCreation,
      allowReceiptCapture: p.allowReceiptCapture,
      maxPromiseDays: p.maxPromiseDays,
    },
    aiConfigured: isAiConfigured(),
  });
});

const putSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().trim().min(1).max(60).optional(),
  tone: z.string().max(500).nullable().optional(),
  instructions: z.string().max(8000).nullable().optional(),
  escalationRules: z.string().max(4000).nullable().optional(),
  greeting: z.string().max(1000).nullable().optional(),
  paymentInstructions: z.string().max(2000).nullable().optional(),
  allowPaymentPromise: z.boolean().optional(),
  allowTicketCreation: z.boolean().optional(),
  allowReceiptCapture: z.boolean().optional(),
  maxPromiseDays: z.number().int().min(1).max(30).optional(),
});

export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const updated = await db
    .update(schema.agentProfile)
    .set({ ...body.data, updatedAt: new Date() })
    .where(scoped(schema.agentProfile.organizationId, session.organizationId))
    .returning();
  if (!updated[0]) return apiError(404, "not_found", "Perfil no encontrado");
  return Response.json({ ok: true });
});
