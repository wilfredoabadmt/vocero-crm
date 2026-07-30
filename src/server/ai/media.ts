import { eq, and, desc } from "drizzle-orm";
import { getDb, schema, type AgentMediaCategory } from "@/lib/db";
import { newId } from "@/lib/db/ids";

export type AgentMediaItem = typeof schema.agentMedia.$inferSelect;

/** Obtiene todos los recursos de imágenes y archivos registrados por la organización. */
export async function getAgentMediaByOrg(
  organizationId: string
): Promise<AgentMediaItem[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.agentMedia)
    .where(eq(schema.agentMedia.organizationId, organizationId))
    .orderBy(desc(schema.agentMedia.createdAt));
}

/** Registra un nuevo recurso de imagen con su categoría y regla de entrega para el agente. */
export async function createAgentMedia(input: {
  organizationId: string;
  category?: AgentMediaCategory;
  name: string;
  url: string;
  rule: string;
  filename: string;
  mimeType: string;
}): Promise<AgentMediaItem> {
  const db = getDb();
  const inserted = await db
    .insert(schema.agentMedia)
    .values({
      id: newId("agentMedia"),
      organizationId: input.organizationId,
      category: input.category ?? "general",
      name: input.name.trim(),
      url: input.url.trim(),
      rule: input.rule.trim(),
      filename: input.filename,
      mimeType: input.mimeType,
    })
    .returning();
  return inserted[0]!;
}

/** Elimina un recurso de imagen de la organización. */
export async function deleteAgentMedia(
  organizationId: string,
  id: string
): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(schema.agentMedia)
    .where(
      and(
        eq(schema.agentMedia.id, id),
        eq(schema.agentMedia.organizationId, organizationId)
      )
    )
    .returning();
  return Boolean(deleted[0]);
}
