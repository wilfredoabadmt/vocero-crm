import { verify, hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { badRequest, unauthorized, AppError } from '../lib/errors.js';
import { createSession, destroySession } from './service.js';
import { loadUser, requireAuth, requireAuthUser } from './guards.js';

// Rate limit simple en memoria para login (por IP por minuto); configurable para suites de prueba
const LOGIN_RATE_LIMIT = Number(process.env.LOGIN_RATE_LIMIT ?? 10);
const attempts = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string) {
  if (process.env.NODE_ENV === 'test') return;
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return;
  }
  entry.count += 1;
  if (entry.count > LOGIN_RATE_LIMIT) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos. Espera un minuto.');
  }
}

const cookieOpts = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.isProd,
  maxAge: 30 * 24 * 60 * 60,
};

export function authRoutes(app: FastifyInstance) {
  // Endpoint de diagnóstico temporal para producción
  app.get('/api/auth/debug-users', async () => {
    const list = await db.select({ email: users.email, role: users.role, isActive: users.isActive }).from(users);
    return list;
  });

  app.post('/api/auth/login', async (request, reply) => {
    checkRateLimit(request.ip);
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body);
    const [user] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase()));
    if (!user || !(await verify(user.passwordHash, body.password))) {
      throw unauthorized('Correo o contraseña incorrectos');
    }
    if (!user.isActive) throw new AppError(403, 'USER_DISABLED', 'Tu cuenta está desactivada');
    const token = await createSession(user.id);
    reply.setCookie('sid', token, cookieOpts);
    return { 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role: user.role, 
        theme: user.theme,
        is_trial: user.isTrial,
        trial_expired: user.isTrial && user.trialExpiresAt ? new Date(user.trialExpiresAt).getTime() < Date.now() : false
      } 
    };
  });

  app.post('/api/auth/register', async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().min(1).max(100),
        password: z.string().min(8).max(100),
      })
      .parse(request.body);

    const [existing] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase()));
    if (existing) {
      throw badRequest('EMAIL_EXISTS', 'Ya existe un usuario registrado con este correo electrónico');
    }

    const passwordHash = await hash(body.password);
    const trialExpiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 días de trial

    const [user] = await db
      .insert(users)
      .values({
        email: body.email.toLowerCase(),
        name: body.name,
        passwordHash,
        role: 'admin',
        isTrial: true,
        trialExpiresAt,
        isActive: true,
      })
      .returning();

    if (!user) {
      throw new AppError(500, 'REGISTRATION_FAILED', 'No se pudo crear la cuenta de usuario');
    }

    const token = await createSession(user.id);
    reply.setCookie('sid', token, cookieOpts);
    reply.code(201);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        theme: user.theme,
        is_trial: user.isTrial,
        trial_expired: false,
      },
    };
  });

  app.post('/api/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    await destroySession(request.cookies['sid']);
    reply.clearCookie('sid', { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (request) => {
    await loadUser(request);
    if (!request.currentUser) throw unauthorized();
    return { user: request.currentUser };
  });

  app.patch('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    const me = requireAuthUser(request);
    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        theme: z.enum(['light', 'dark', 'system']).optional(),
        password: z.object({ current: z.string(), new: z.string().min(8) }).optional(),
      })
      .parse(request.body);

    const updates: Partial<typeof users.$inferInsert> = {};
    if (body.name) updates.name = body.name;
    if (body.theme) updates.theme = body.theme;
    if (body.password) {
      const [row] = await db.select().from(users).where(eq(users.id, me.id));
      if (!row || !(await verify(row.passwordHash, body.password.current))) {
        throw badRequest('INVALID_CURRENT_PASSWORD', 'La contraseña actual no es correcta');
      }
      updates.passwordHash = await hash(body.password.new);
    }
    if (Object.keys(updates).length > 0) await db.update(users).set(updates).where(eq(users.id, me.id));
    const [updated] = await db.select().from(users).where(eq(users.id, me.id));
    return { user: { id: updated!.id, email: updated!.email, name: updated!.name, role: updated!.role, theme: updated!.theme } };
  });
}
