import { describe, expect, it } from 'vitest';
import { countTemplateVariables } from '../src/modules/templates/routes.js';
import { renderTemplateBody } from '../src/modules/messages/send.js';
import { createSimInbox, getApp, loginAdmin, simulateIncoming, sleep } from './helpers.js';
import type { ConversationSummary } from '../src/modules/conversations/serialize.js';

describe('validación de variables (unidad)', () => {
  it('cuenta variables consecutivas', () => {
    expect(countTemplateVariables('Sin variables')).toBe(0);
    expect(countTemplateVariables('Hola {{1}}, somos {{2}}')).toBe(2);
    expect(countTemplateVariables('{{1}} {{1}} {{2}}')).toBe(2);
  });

  it('rechaza variables no consecutivas', () => {
    expect(() => countTemplateVariables('Hola {{2}}')).toThrow();
    expect(() => countTemplateVariables('{{1}} y {{3}}')).toThrow();
  });

  it('renderiza el cuerpo con valores', () => {
    expect(renderTemplateBody('Hola {{1}}, de {{2}}', ['Ana', 'Acme'])).toBe('Hola Ana, de Acme');
  });
});

describe('ciclo de vida de plantillas (T040)', () => {
  it('crear ⇒ pending ⇒ aprobada por el mock ⇒ disponible en selector', async () => {
    const app = await getApp();
    const cookie = await loginAdmin();
    const inboxId = await createSimInbox();

    const created = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: { cookie },
      payload: { inbox_id: inboxId, name: 'seguimiento_test', language: 'es', category: 'UTILITY', body: 'Hola {{1}}, ¿sigues ahí?' },
    });
    expect(created.statusCode).toBe(201);
    const tpl = created.json() as { id: number; status: string; variables_count: number };
    expect(tpl.status).toBe('pending');
    expect(tpl.variables_count).toBe(1);

    // El mock aprueba a los ~5 s vía webhook sintético
    await sleep(6000);
    const list = (
      await app.inject({ method: 'GET', url: '/api/templates', headers: { cookie } })
    ).json() as { items: { id: number; status: string }[] };
    expect(list.items.find((t) => t.id === tpl.id)!.status).toBe('approved');
  }, 20000);

  it('plantillas con _reject quedan rechazadas con motivo', async () => {
    const app = await getApp();
    const cookie = await loginAdmin();
    const inboxId = await createSimInbox();
    const created = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: { cookie },
      payload: { inbox_id: inboxId, name: 'promo_reject', language: 'es', category: 'MARKETING', body: 'Oferta!!!' },
    });
    expect(created.statusCode).toBe(201);
    await sleep(6000);
    const list = (
      await app.inject({ method: 'GET', url: '/api/templates', headers: { cookie } })
    ).json() as { items: { name: string; status: string; rejection_reason: string | null }[] };
    const rejected = list.items.find((t) => t.name === 'promo_reject')!;
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejection_reason).toBeTruthy();
  }, 20000);

  it('rechaza nombres inválidos y variables no consecutivas (API)', async () => {
    const app = await getApp();
    const cookie = await loginAdmin();
    const inboxId = await createSimInbox();
    const badName = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: { cookie },
      payload: { inbox_id: inboxId, name: 'Nombre Inválido', body: 'x' },
    });
    expect(badName.statusCode).toBe(400);
    const badVars = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: { cookie },
      payload: { inbox_id: inboxId, name: 'vars_malas', body: 'Hola {{2}}' },
    });
    expect(badVars.statusCode).toBe(400);
  });

  it('enviar plantilla aprobada fuera de ventana funciona y valida variables', async () => {
    const app = await getApp();
    const cookie = await loginAdmin();
    const inboxId = await createSimInbox();
    await simulateIncoming({ inbox_id: inboxId, from: '5215570000001', body: 'viejo', timestamp_offset_hours: -25 });
    const conv = (
      (await app.inject({ method: 'GET', url: '/api/conversations', headers: { cookie } })).json() as {
        items: ConversationSummary[];
      }
    ).items.find((c) => c.contact.wa_id === '5215570000001')!;

    await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: { cookie },
      payload: { inbox_id: inboxId, name: 'recontacto_x', body: 'Hola {{1}}, te buscamos de {{2}}' },
    });
    await sleep(6000);
    const selectable = (
      await app.inject({
        method: 'GET',
        url: `/api/templates/selectable?conversation_id=${conv.id}`,
        headers: { cookie },
      })
    ).json() as { items: { id: number; name: string }[] };
    const tpl = selectable.items.find((t) => t.name === 'recontacto_x')!;
    expect(tpl).toBeDefined();

    // variables incompletas ⇒ 400
    const missing = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conv.id}/messages`,
      headers: { cookie },
      payload: { type: 'template', template_id: tpl.id, variables: ['Ana'] },
    });
    expect(missing.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conv.id}/messages`,
      headers: { cookie },
      payload: { type: 'template', template_id: tpl.id, variables: ['Ana', 'Acme'] },
    });
    expect(ok.statusCode).toBe(201);
    expect((ok.json() as { body: string }).body).toBe('Hola Ana, te buscamos de Acme');
  }, 25000);
});
