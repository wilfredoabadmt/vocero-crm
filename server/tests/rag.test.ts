import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { agentDocuments, aiAgents } from '../src/db/schema.js';
import { chunkText, indexDocument, retrieveChunks } from '../src/rag/index.js';

describe('chunking (unidad)', () => {
  it('texto corto ⇒ un solo chunk', () => {
    expect(chunkText('Hola mundo')).toEqual(['Hola mundo']);
  });

  it('texto vacío ⇒ sin chunks', () => {
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('texto largo se parte con solape y sin perder contenido', () => {
    const paragraph = 'Las reservas se confirman con un anticipo del 30 por ciento. ';
    const text = paragraph.repeat(60); // ~3700 chars
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1100);
    expect(chunks.join(' ')).toContain('anticipo del 30 por ciento');
  });
});

describe('indexación y retrieval (mismo pipeline que producción)', () => {
  it('indexa un documento y recupera el chunk relevante en español', async () => {
    const { eq } = await import('drizzle-orm');
    await db.update(aiAgents).set({ isDefault: false }).where(eq(aiAgents.isDefault, true));

    const [agent] = await db
      .insert(aiAgents)
      .values({ name: 'RAG Test', purpose: 'test', model: 'sim/echo-model', isDefault: true })
      .returning();

    const dir = path.resolve('./data/test-uploads/rag');
    mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'faq.txt');
    writeFileSync(
      filePath,
      [
        'Nuestros horarios de atención son de lunes a viernes de 9 a 18 horas.',
        '',
        'El costo del tour a Chichen Itza es de 1200 pesos por persona e incluye transporte y comida.',
        '',
        'Aceptamos pagos con tarjeta de crédito, transferencia bancaria y efectivo en sucursal.',
      ].join('\n'),
      'utf8',
    );

    const [doc] = await db
      .insert(agentDocuments)
      .values({ agentId: agent!.id, filename: 'faq.txt', mime: 'text/plain', sizeBytes: 300, path: filePath, status: 'processing' })
      .returning();

    await indexDocument(doc!.id);

    const [updated] = await db.select().from(agentDocuments);
    expect(updated!.status).toBe('ready');

    const hits = await retrieveChunks(agent!.id, 'cuánto cuesta el tour a chichen');
    expect(hits.some((h) => h.includes('1200 pesos'))).toBe(true);

    const hits2 = await retrieveChunks(agent!.id, 'tarjeta transferencia');
    expect(hits2.some((h) => h.includes('transferencia bancaria'))).toBe(true);
  });

  it('documento sin texto extraíble ⇒ estado failed con motivo', async () => {
    const [agent] = await db
      .insert(aiAgents)
      .values({ name: 'RAG Vacío', purpose: 'test', model: 'sim/echo-model' })
      .returning();
    const dir = path.resolve('./data/test-uploads/rag');
    mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'vacio.txt');
    writeFileSync(filePath, '   ', 'utf8');
    const [doc] = await db
      .insert(agentDocuments)
      .values({ agentId: agent!.id, filename: 'vacio.txt', mime: 'text/plain', sizeBytes: 3, path: filePath, status: 'processing' })
      .returning();
    await indexDocument(doc!.id);
    const rows = await db.select().from(agentDocuments);
    expect(rows.find((d) => d.id === doc!.id)!.status).toBe('failed');
  });

  it('consulta sin coincidencias ⇒ lista vacía sin error', async () => {
    const hits = await retrieveChunks(999999, 'xyzabc');
    expect(hits).toEqual([]);
  });
});
