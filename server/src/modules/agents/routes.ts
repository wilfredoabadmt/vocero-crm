import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { count, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../auth/guards.js';
import { config } from '../../config.js';
import { db } from '../../db/client.js';
import { agentDocuments, aiAgents, conversations } from '../../db/schema.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { indexDocument } from '../../rag/index.js';

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOC_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
};

const agentBody = z.object({
  name: z.string().min(1).max(100),
  purpose: z.string().min(1).max(4000),
  tone: z.string().max(2000).nullable().optional(),
  instructions: z.string().max(8000).nullable().optional(),
  business_info: z.string().max(8000).nullable().optional(),
  escalation_rules: z.string().max(4000).nullable().optional(),
  model: z.string().min(1).max(200),
  is_default: z.boolean().optional(),
});

function serializeAgent(a: typeof aiAgents.$inferSelect, documentsCount = 0) {
  return {
    id: a.id,
    name: a.name,
    purpose: a.purpose,
    tone: a.tone,
    instructions: a.instructions,
    business_info: a.businessInfo,
    escalation_rules: a.escalationRules,
    model: a.model,
    is_default: a.isDefault,
    documents_count: documentsCount,
    created_at: a.createdAt.toISOString(),
  };
}

async function setDefaultAgent(agentId: number) {
  await db.transaction(async (tx) => {
    await tx.update(aiAgents).set({ isDefault: false }).where(eq(aiAgents.isDefault, true));
    await tx.update(aiAgents).set({ isDefault: true }).where(eq(aiAgents.id, agentId));
  });
}

export function agentRoutes(app: FastifyInstance) {
  app.get('/api/agents', { preHandler: requireAuth }, async () => {
    const rows = await db.select().from(aiAgents).orderBy(desc(aiAgents.isDefault), aiAgents.name);
    const counts = await db
      .select({ agentId: agentDocuments.agentId, n: count() })
      .from(agentDocuments)
      .groupBy(agentDocuments.agentId);
    const countBy = new Map(counts.map((c) => [c.agentId, Number(c.n)]));
    return { items: rows.map((a) => serializeAgent(a, countBy.get(a.id) ?? 0)) };
  });

  app.post('/api/agents', { preHandler: requireAdmin }, async (request, reply) => {
    const body = agentBody.parse(request.body);
    const [{ n: existing }] = (await db.select({ n: count() }).from(aiAgents)) as [{ n: number | string }];
    const makeDefault = body.is_default || Number(existing) === 0; // el primero siempre es default

    const [agent] = await db
      .insert(aiAgents)
      .values({
        name: body.name,
        purpose: body.purpose,
        tone: body.tone ?? null,
        instructions: body.instructions ?? null,
        businessInfo: body.business_info ?? null,
        escalationRules: body.escalation_rules ?? null,
        model: body.model,
        isDefault: false,
      })
      .returning();
    if (makeDefault) await setDefaultAgent(agent!.id);
    reply.code(201);
    return serializeAgent({ ...agent!, isDefault: makeDefault });
  });

  app.patch('/api/agents/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const body = agentBody.partial().parse(request.body);
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.purpose !== undefined) updates.purpose = body.purpose;
    if (body.tone !== undefined) updates.tone = body.tone;
    if (body.instructions !== undefined) updates.instructions = body.instructions;
    if (body.business_info !== undefined) updates.businessInfo = body.business_info;
    if (body.escalation_rules !== undefined) updates.escalationRules = body.escalation_rules;
    if (body.model !== undefined) updates.model = body.model;

    const [agent] = await db.update(aiAgents).set(updates).where(eq(aiAgents.id, id)).returning();
    if (!agent) throw notFound('Agente no encontrado');
    if (body.is_default === true && !agent.isDefault) {
      await setDefaultAgent(id);
      agent.isDefault = true;
    }
    return serializeAgent(agent);
  });

  app.post('/api/agents/:id/default', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, id));
    if (!agent) throw notFound('Agente no encontrado');
    await setDefaultAgent(id);
    return { ok: true };
  });

  app.delete('/api/agents/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, id));
    if (!agent) throw notFound('Agente no encontrado');
    if (agent.isDefault) {
      const [{ n }] = (await db.select({ n: count() }).from(aiAgents)) as [{ n: number | string }];
      if (Number(n) > 1) {
        throw conflict('DEFAULT_AGENT_REQUIRED', 'Designa otro agente por defecto antes de eliminar este');
      }
    }
    // Las conversaciones asignadas pasan al agente por defecto (assigned_agent_id → NULL)
    await db.update(conversations).set({ assignedAgentId: null }).where(eq(conversations.assignedAgentId, id));
    await db.delete(aiAgents).where(eq(aiAgents.id, id));
    return { ok: true };
  });

  // ---- Documentos de conocimiento ----

  app.get('/api/agents/:id/documents', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const rows = await db
      .select()
      .from(agentDocuments)
      .where(eq(agentDocuments.agentId, id))
      .orderBy(desc(agentDocuments.id));
    return {
      items: rows.map((d) => ({
        id: d.id,
        filename: d.filename,
        mime: d.mime,
        size_bytes: d.sizeBytes,
        status: d.status,
        error: d.error,
        created_at: d.createdAt.toISOString(),
      })),
    };
  });

  app.post('/api/agents/:id/documents', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, id));
    if (!agent) throw notFound('Agente no encontrado');

    const file = await request.file({ limits: { fileSize: MAX_DOC_BYTES } });
    if (!file) throw badRequest('NO_FILE', 'Adjunta un archivo');

    const lowerName = file.filename.toLowerCase();
    const allowedByExt = ['.pdf', '.docx', '.txt', '.md'].some((ext) => lowerName.endsWith(ext));
    if (!ALLOWED_DOC_TYPES[file.mimetype] && !allowedByExt) {
      throw badRequest('UNSUPPORTED_TYPE', 'Formatos permitidos: PDF, DOCX, TXT, MD (máx. 10 MB)');
    }

    const buffer = await file.toBuffer();
    if (buffer.length > MAX_DOC_BYTES) throw badRequest('FILE_TOO_LARGE', 'El archivo supera los 10 MB');

    const dir = path.join(config.uploadsDir, 'documents', String(id));
    mkdirSync(dir, { recursive: true });
    const safeName = `${Date.now()}-${file.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(dir, safeName);
    writeFileSync(filePath, buffer);

    const [doc] = await db
      .insert(agentDocuments)
      .values({
        agentId: id,
        filename: file.filename,
        mime: file.mimetype,
        sizeBytes: buffer.length,
        path: filePath,
        status: 'processing',
      })
      .returning();

    // Indexación asíncrona
    setImmediate(() => void indexDocument(doc!.id));
    reply.code(201);
    return { id: doc!.id, filename: doc!.filename, status: doc!.status };
  });

  app.delete('/api/documents/:docId', { preHandler: requireAdmin }, async (request) => {
    const { docId } = z.object({ docId: z.coerce.number() }).parse(request.params);
    const [doc] = await db.select().from(agentDocuments).where(eq(agentDocuments.id, docId));
    if (!doc) throw notFound('Documento no encontrado');
    try {
      unlinkSync(doc.path);
    } catch {
      // el archivo puede no existir; el registro se borra igual
    }
    await db.delete(agentDocuments).where(eq(agentDocuments.id, docId));
    return { ok: true };
  });
}
