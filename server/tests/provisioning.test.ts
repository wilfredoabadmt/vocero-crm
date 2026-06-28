import { describe, expect, it } from 'vitest';
import { getApp, loginAdmin } from './helpers.js';

const body = {
  waba_id: 'WABA-1',
  phone_number_id: 'PNID-PROV-1',
  display_phone_number: '+52 1 55 9999 0001',
  access_token: 'TOKEN-PERMANENTE-XYZ',
  business_name: 'Negocio Test',
};

describe('provisioning del tech provider (T028)', () => {
  it('rechaza sin el bearer secret', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'POST', url: '/api/provisioning/whatsapp', payload: body });
    expect(res.statusCode).toBe(401);
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/provisioning/whatsapp',
      headers: { authorization: 'Bearer secreto-incorrecto-aqui' },
      payload: body,
    });
    expect(res2.statusCode).toBe(401);
  });

  it('crea la bandeja conectada y es idempotente por phone_number_id', async () => {
    const app = await getApp();
    const cookie = await loginAdmin();
    const headers = { authorization: 'Bearer test-provisioning-secret' };

    const first = await app.inject({ method: 'POST', url: '/api/provisioning/whatsapp', headers, payload: body });
    expect(first.statusCode).toBe(200);
    const inboxId = (first.json() as { inbox_id: number }).inbox_id;

    // Reintento del provider (dentro de la ventana 1-180s) ⇒ misma bandeja
    const retry = await app.inject({
      method: 'POST',
      url: '/api/provisioning/whatsapp',
      headers,
      payload: { ...body, access_token: 'TOKEN-RENOVADO' },
    });
    expect((retry.json() as { inbox_id: number }).inbox_id).toBe(inboxId);

    const list = (
      await app.inject({ method: 'GET', url: '/api/inboxes', headers: { cookie } })
    ).json() as { items: { id: number; status: string; phone_number_id: string | null }[] };
    const matches = list.items.filter((i) => i.phone_number_id === 'PNID-PROV-1');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.status).toBe('connected');
  });

  it('completa la bandeja pending creada desde la UI (flujo de conexión)', async () => {
    const app = await getApp();
    const cookie = await loginAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/inboxes',
      headers: { cookie },
      payload: { name: 'Ventas' },
    });
    expect(created.statusCode).toBe(201);
    const pendingId = (created.json() as { id: number; onboarding_url: string }).id;
    expect((created.json() as { onboarding_url: string }).onboarding_url).toContain('aishiagency.tech');

    await app.inject({
      method: 'POST',
      url: '/api/provisioning/whatsapp',
      headers: { authorization: 'Bearer test-provisioning-secret' },
      payload: { ...body, phone_number_id: 'PNID-PROV-2' },
    });

    const list = (
      await app.inject({ method: 'GET', url: '/api/inboxes', headers: { cookie } })
    ).json() as { items: { id: number; status: string; name: string }[] };
    const completed = list.items.find((i) => i.id === pendingId)!;
    expect(completed.status).toBe('connected');
    expect(completed.name).toBe('Ventas'); // conserva el nombre que puso el admin
  });

  it('nunca expone el token por la API', async () => {
    const app = await getApp();
    const cookie = await loginAdmin();
    const res = await app.inject({ method: 'GET', url: '/api/inboxes', headers: { cookie } });
    expect(res.body).not.toContain('TOKEN-PERMANENTE');
    expect(res.body).not.toContain('TOKEN-RENOVADO');
    expect(res.body).not.toContain('access_token');
  });
});
