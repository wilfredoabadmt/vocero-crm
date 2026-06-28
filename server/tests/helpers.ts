import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

let app: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    const { runMigrations } = await import('../src/db/client.js');
    const { seed } = await import('../src/db/seed.js');
    await runMigrations();
    await seed();

    app = await buildApp();
    await app.ready();
  }
  return app;
}

export async function loginAdmin(): Promise<string> {
  const server = await getApp();
  const res = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'admin@test.local', password: 'admin-test-1234' },
  });
  const cookie = res.cookies.find((c) => c.name === 'sid');
  if (!cookie) throw new Error(`Login admin falló: ${res.statusCode} ${res.body}`);
  return `sid=${cookie.value}`;
}

export const SIM_BEARER = { authorization: 'Bearer test-provisioning-secret' };

/** Crea una bandeja conectada vía provisioning simulado y devuelve su id. */
export async function createSimInbox(phoneNumberId = 'SIM-PNID-1'): Promise<number> {
  const server = await getApp();
  const res = await server.inject({
    method: 'POST',
    url: '/api/simulate/provisioning',
    headers: SIM_BEARER,
    payload: { phone_number_id: phoneNumberId },
  });
  return (res.json() as { inbox_id: number }).inbox_id;
}

/** Inyecta un mensaje entrante simulado. */
export async function simulateIncoming(opts: {
  inbox_id: number;
  from: string;
  body?: string;
  name?: string;
  type?: string;
  timestamp_offset_hours?: number;
}) {
  const server = await getApp();
  return server.inject({
    method: 'POST',
    url: '/api/simulate/incoming-message',
    headers: SIM_BEARER,
    payload: { name: 'Test', type: 'text', body: 'hola', ...opts },
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
