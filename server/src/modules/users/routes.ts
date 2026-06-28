import { hash } from '@node-rs/argon2';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireAuthUser } from '../../auth/guards.js';
import { destroyUserSessions } from '../../auth/service.js';
import { db } from '../../db/client.js';
import { users } from '../../db/schema.js';
import { badRequest, notFound } from '../../lib/errors.js';

function serializeUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    is_active: u.isActive,
    created_at: u.createdAt.toISOString(),
  };
}

export function userRoutes(app: FastifyInstance) {
  app.get('/api/users', { preHandler: requireAdmin }, async () => {
    const rows = await db.select().from(users).orderBy(desc(users.id));
    return { items: rows.map(serializeUser) };
  });

  app.post('/api/users', { preHandler: requireAdmin }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(1).max(100),
        email: z.string().email(),
        password: z.string().min(8).max(200),
        role: z.enum(['admin', 'agent']).default('agent'),
      })
      .parse(request.body);
    const [existing] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase()));
    if (existing) throw badRequest('EMAIL_EXISTS', 'Ya existe un usuario con ese correo');
    const [user] = await db
      .insert(users)
      .values({
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash: await hash(body.password),
        role: body.role,
      })
      .returning();
    reply.code(201);
    return serializeUser(user!);
  });

  app.patch('/api/users/:id', { preHandler: requireAdmin }, async (request) => {
    const me = requireAuthUser(request);
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        role: z.enum(['admin', 'agent']).optional(),
        password: z.string().min(8).max(200).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(request.body);

    if (id === me.id && body.is_active === false) {
      throw badRequest('CANNOT_DISABLE_SELF', 'No puedes desactivar tu propia cuenta');
    }
    if (id === me.id && body.role === 'agent') {
      throw badRequest('CANNOT_DEMOTE_SELF', 'No puedes quitarte el rol de administrador');
    }

    const updates: Record<string, unknown> = {};
    if (body.name) updates.name = body.name;
    if (body.role) updates.role = body.role;
    if (body.password) updates.passwordHash = await hash(body.password);
    if (body.is_active !== undefined) updates.isActive = body.is_active;

    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    if (!user) throw notFound('Usuario no encontrado');

    // FR-032: desactivar invalida sesiones; cambiar contraseña también
    if (body.is_active === false || body.password) await destroyUserSessions(id);
    return serializeUser(user);
  });
}
