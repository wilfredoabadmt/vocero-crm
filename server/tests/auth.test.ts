import { describe, expect, it } from 'vitest';
import { getApp, loginAdmin } from './helpers.js';

describe('autenticación y roles', () => {
  it('rechaza credenciales inválidas', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@test.local', password: 'incorrecta' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('login correcto devuelve usuario y cookie de sesión', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@test.local', password: 'admin-test-1234' },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { user: { role: string } }).user.role).toBe('admin');
    expect(res.cookies.some((c) => c.name === 'sid')).toBe(true);
  });

  it('GET /api/auth/me requiere sesión', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('un asesor no puede acceder a rutas de admin (T057)', async () => {
    const app = await getApp();
    const adminCookie = await loginAdmin();
    // crear asesor
    const created = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie: adminCookie },
      payload: { name: 'Asesor Uno', email: 'asesor@test.local', password: 'password123', role: 'agent' },
    });
    expect(created.statusCode).toBe(201);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'asesor@test.local', password: 'password123' },
    });
    const agentCookie = `sid=${login.cookies.find((c) => c.name === 'sid')!.value}`;

    for (const route of ['/api/users', '/api/settings/openrouter-key']) {
      const res = await app.inject({
        method: route === '/api/users' ? 'GET' : 'PUT',
        url: route,
        headers: { cookie: agentCookie },
        ...(route !== '/api/users' ? { payload: { api_key: 'sk-sim-x' } } : {}),
      });
      expect([401, 403]).toContain(res.statusCode);
    }

    // pero sí puede ver conversaciones
    const convs = await app.inject({ method: 'GET', url: '/api/conversations', headers: { cookie: agentCookie } });
    expect(convs.statusCode).toBe(200);
  });

  it('desactivar un usuario invalida sus sesiones (FR-032)', async () => {
    const app = await getApp();
    const adminCookie = await loginAdmin();
    await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie: adminCookie },
      payload: { name: 'Temporal', email: 'temp@test.local', password: 'password123', role: 'agent' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'temp@test.local', password: 'password123' },
    });
    const tempCookie = `sid=${login.cookies.find((c) => c.name === 'sid')!.value}`;
    const users = (await app.inject({ method: 'GET', url: '/api/users', headers: { cookie: adminCookie } })).json() as {
      items: { id: number; email: string }[];
    };
    const tempUser = users.items.find((u) => u.email === 'temp@test.local')!;

    const disabled = await app.inject({
      method: 'PATCH',
      url: `/api/users/${tempUser.id}`,
      headers: { cookie: adminCookie },
      payload: { is_active: false },
    });
    expect(disabled.statusCode).toBe(200);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: tempCookie } });
    expect(me.statusCode).toBe(401);

    const relogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'temp@test.local', password: 'password123' },
    });
    expect(relogin.statusCode).toBe(403);
  });
});
