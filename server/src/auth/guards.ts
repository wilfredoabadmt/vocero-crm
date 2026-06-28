import type { FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../lib/errors.js';
import { getSessionUser, type SessionUser } from './service.js';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: SessionUser | null;
  }
}

export async function loadUser(request: FastifyRequest) {
  request.currentUser = await getSessionUser(request.cookies['sid']);
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  await loadUser(request);
  if (!request.currentUser) throw unauthorized();
}

export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply) {
  await loadUser(request);
  if (!request.currentUser) throw unauthorized();
  if (request.currentUser.role !== 'admin') throw forbidden();
}

/** Para handlers tras requireAuth: devuelve el usuario con tipo no-nulo. */
export function requireAuthUser(request: FastifyRequest): SessionUser {
  if (!request.currentUser) throw unauthorized();
  return request.currentUser;
}
