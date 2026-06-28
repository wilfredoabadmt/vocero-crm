import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAuthUser } from '../../auth/guards.js';
import { db } from '../../db/client.js';
import { notes, users } from '../../db/schema.js';
import { forbidden, notFound } from '../../lib/errors.js';

export function noteRoutes(app: FastifyInstance) {
  app.get('/api/conversations/:id/notes', { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const rows = await db
      .select({ note: notes, authorName: users.name })
      .from(notes)
      .leftJoin(users, eq(notes.userId, users.id))
      .where(eq(notes.conversationId, id))
      .orderBy(desc(notes.id));
    return {
      items: rows.map(({ note, authorName }) => ({
        id: note.id,
        body: note.body,
        author: authorName ?? 'Usuario eliminado',
        author_id: note.userId,
        created_at: note.createdAt.toISOString(),
      })),
    };
  });

  app.post('/api/conversations/:id/notes', { preHandler: requireAuth }, async (request, reply) => {
    const me = requireAuthUser(request);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params);
    const { body } = z.object({ body: z.string().min(1).max(4000) }).parse(request.body);
    const [note] = await db.insert(notes).values({ conversationId: id, userId: me.id, body }).returning();
    reply.code(201);
    return {
      id: note!.id,
      body: note!.body,
      author: me.name,
      author_id: me.id,
      created_at: note!.createdAt.toISOString(),
    };
  });

  app.delete('/api/notes/:noteId', { preHandler: requireAuth }, async (request) => {
    const me = requireAuthUser(request);
    const { noteId } = z.object({ noteId: z.coerce.number().int() }).parse(request.params);
    const [note] = await db.select().from(notes).where(eq(notes.id, noteId));
    if (!note) throw notFound('Nota no encontrada');
    if (note.userId !== me.id && me.role !== 'admin') throw forbidden('Solo el autor o un admin puede borrar la nota');
    await db.delete(notes).where(eq(notes.id, noteId));
    return { ok: true };
  });
}
