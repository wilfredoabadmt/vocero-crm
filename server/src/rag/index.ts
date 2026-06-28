import { readFileSync } from 'node:fs';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentDocuments, documentChunks } from '../db/schema.js';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

// ---- Extracción de texto ----

export async function extractText(buffer: Buffer, mime: string, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js' as string);
    const result = (await pdfParse(buffer)) as { text: string };
    return result.text;
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return buffer.toString('utf8');
}

// ---- Chunking ----

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      // corta en el límite de párrafo u oración más cercano hacia atrás
      const slice = clean.slice(start, end);
      const breakAt = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '), slice.lastIndexOf('\n'));
      if (breakAt > CHUNK_SIZE * 0.4) end = start + breakAt + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.length > 0);
}

// ---- Configuración FTS (spanish si está disponible; si no, simple) ----

let ftsConfig: string | null = null;

async function getFtsConfig(): Promise<string> {
  if (ftsConfig) return ftsConfig;
  try {
    const rows = (await db.execute(sql`SELECT cfgname FROM pg_ts_config WHERE cfgname = 'spanish'`)) as unknown as {
      rows?: unknown[];
    };
    const found = Array.isArray(rows) ? rows.length > 0 : (rows.rows?.length ?? 0) > 0;
    ftsConfig = found ? 'spanish' : 'simple';
  } catch {
    ftsConfig = 'simple';
  }
  return ftsConfig;
}

// ---- Indexación ----

export async function indexDocument(documentId: number): Promise<void> {
  const [doc] = await db.select().from(agentDocuments).where(eq(agentDocuments.id, documentId));
  if (!doc) return;
  try {
    const buffer = readFileSync(doc.path);
    const text = await extractText(buffer, doc.mime, doc.filename);
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('El documento no contiene texto extraíble');

    const cfg = await getFtsConfig();
    await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
    for (let i = 0; i < chunks.length; i++) {
      await db.insert(documentChunks).values({
        documentId,
        agentId: doc.agentId,
        chunkIndex: i,
        content: chunks[i]!,
        tsv: sql`to_tsvector(${cfg}::regconfig, ${chunks[i]!})` as unknown as string,
      });
    }
    await db.update(agentDocuments).set({ status: 'ready', error: null }).where(eq(agentDocuments.id, documentId));
  } catch (err) {
    await db
      .update(agentDocuments)
      .set({ status: 'failed', error: err instanceof Error ? err.message : 'Error procesando el documento' })
      .where(eq(agentDocuments.id, documentId));
  }
}

// ---- Retrieval ----

export async function retrieveChunks(agentId: number, query: string, limit = 5): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const cfg = await getFtsConfig();
  try {
    const rows = await db
      .select({ content: documentChunks.content })
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.agentId, agentId),
          sql`${documentChunks.tsv} @@ websearch_to_tsquery(${cfg}::regconfig, ${trimmed})`,
        ),
      )
      .orderBy(sql`ts_rank(${documentChunks.tsv}, websearch_to_tsquery(${cfg}::regconfig, ${trimmed})) DESC`)
      .limit(limit);
    if (rows.length > 0) return rows.map((r) => r.content);
  } catch {
    // websearch_to_tsquery puede fallar con entradas raras ⇒ fallback
  }
  // Fallback: ILIKE por términos significativos
  const terms = trimmed.split(/\s+/).filter((t) => t.length >= 4).slice(0, 5);
  if (terms.length === 0) return [];
  const rows = await db
    .select({ content: documentChunks.content })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.agentId, agentId),
        sql.join(
          terms.map((t) => sql`${documentChunks.content} ILIKE ${'%' + t + '%'}`),
          sql` OR `,
        ),
      ),
    )
    .limit(limit);
  return rows.map((r) => r.content);
}
