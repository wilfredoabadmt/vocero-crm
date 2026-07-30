/**
 * API Route: /api/kb/size
 *
 * GET → Devuelve el tamaño estimado del knowledge base en caracteres.
 *
 * Útil para mostrar un indicador de "cuánto KB le queda al agente".
 * El umbral de 24,000 caracteres es heurístico (~6k tokens).
 */

import { asc } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { renderKb } from "@/server/ai/prompts";

export const dynamic = "force-dynamic";

const WARN_CHARS = 24_000; // ~6k tokens

export const GET = withAuth(async (session) => {
  const db = getDb();

  const entries = await db
    .select()
    .from(schema.kbEntry)
    .where(
      scoped(schema.kbEntry.organizationId, session.organizationId)
    )
    .orderBy(asc(schema.kbEntry.createdAt));

  const chars = renderKb(entries).length;

  return Response.json({
    chars,
    warnAt: WARN_CHARS,
    warning: chars >= WARN_CHARS,
  });
});
