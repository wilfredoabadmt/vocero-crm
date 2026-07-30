import { NextResponse } from "next/server";
import { withAuth, apiError } from "@/lib/api";
import { uploadToR2 } from "@/lib/storage/r2";
import {
  createAgentMedia,
  deleteAgentMedia,
  getAgentMediaByOrg,
} from "@/server/ai/media";
import type { AgentMediaCategory } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET: Obtiene la lista de imágenes/medios registrados para el agente. */
export const GET = withAuth(async (session) => {
  const mediaList = await getAgentMediaByOrg(session.organizationId);
  return NextResponse.json({ ok: true, media: mediaList });
});

/** POST: Sube una nueva imagen a Cloudflare R2 y la registra en la BD. */
export const POST = withAuth(async (session, req: Request) => {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = (formData.get("name") as string | null)?.trim();
    const rule = (formData.get("rule") as string | null)?.trim();
    const category = (formData.get("category") as AgentMediaCategory | null) ?? "general";

    if (!file) {
      return apiError(400, "bad_request", "Debes seleccionar una imagen para subir.");
    }
    if (!name || name.length === 0) {
      return apiError(400, "bad_request", "Ingresa un nombre o título para identificar la imagen.");
    }
    if (!rule || rule.length === 0) {
      return apiError(400, "bad_request", "Ingresa la regla de entrega o descripción para el agente.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Subir a Cloudflare R2
    const publicUrl = await uploadToR2({
      file: buffer,
      filename: file.name || "imagen.jpg",
      mimeType: file.type || "image/jpeg",
    });

    // Guardar registro en Postgres
    const item = await createAgentMedia({
      organizationId: session.organizationId,
      category,
      name,
      url: publicUrl,
      rule,
      filename: file.name || "imagen.jpg",
      mimeType: file.type || "image/jpeg",
    });

    return NextResponse.json({ ok: true, item });
  } catch (err) {
    console.error("[api/agent/media] Error al subir archivo:", err);
    return apiError(
      500,
      "server_error",
      err instanceof Error ? err.message : "Error al procesar la subida del archivo"
    );
  }
});

/** DELETE: Elimina una imagen del catálogo del agente. */
export const DELETE = withAuth(async (session, req: Request) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return apiError(400, "bad_request", "Parámetro 'id' faltante");
  }

  const success = await deleteAgentMedia(session.organizationId, id);
  if (!success) {
    return apiError(404, "not_found", "Recurso no encontrado");
  }

  return NextResponse.json({ ok: true });
});
