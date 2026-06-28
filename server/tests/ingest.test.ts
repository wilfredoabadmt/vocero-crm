import { describe, expect, it } from 'vitest';
import { createSimInbox, getApp, loginAdmin, simulateIncoming, SIM_BEARER } from './helpers.js';
import type { ConversationSummary } from '../src/modules/conversations/serialize.js';

async function listConversations(cookie: string) {
  const app = await getApp();
  const res = await app.inject({ method: 'GET', url: '/api/conversations', headers: { cookie } });
  return (res.json() as { items: ConversationSummary[] }).items;
}

describe('pipeline de ingesta (T023)', () => {
  it('mensaje entrante crea lead, conversación y mensaje; el lead entra en etapa 1', async () => {
    const cookie = await loginAdmin();
    const inboxId = await createSimInbox();
    await simulateIncoming({ inbox_id: inboxId, from: '5215511111111', name: 'Ana', body: 'Hola, info por favor' });

    const items = await listConversations(cookie);
    const conv = items.find((c) => c.contact.wa_id === '5215511111111');
    expect(conv).toBeDefined();
    expect(conv!.contact.name).toBe('Ana');
    expect(conv!.last_message_preview).toBe('Hola, info por favor');
    expect(conv!.unread_count).toBe(1);
    expect(conv!.window.open).toBe(true);
    expect(conv!.contact.stage_id).toBeGreaterThan(0); // etapa asignada (la 1 del seed)
  });

  it('mensajes consecutivos del mismo contacto van a la MISMA conversación y suman no leídos', async () => {
    const cookie = await loginAdmin();
    const inboxId = await createSimInbox();
    await simulateIncoming({ inbox_id: inboxId, from: '5215522222222', body: 'uno' });
    await simulateIncoming({ inbox_id: inboxId, from: '5215522222222', body: 'dos' });

    const items = (await listConversations(cookie)).filter((c) => c.contact.wa_id === '5215522222222');
    expect(items).toHaveLength(1);
    expect(items[0]!.unread_count).toBe(2);
    expect(items[0]!.last_message_preview).toBe('dos');
  });

  it('wamid duplicado se descarta (reintentos de Meta inocuos)', async () => {
    const cookie = await loginAdmin();
    const app = await getApp();
    const inboxId = await createSimInbox();

    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'SIM-WABA',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: 'SIM', phone_number_id: 'SIM-PNID-1' },
                contacts: [{ profile: { name: 'Dup' }, wa_id: '5215533333333' }],
                messages: [
                  { from: '5215533333333', id: 'wamid.DUP-1', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'duplicado' } },
                ],
              },
            },
          ],
        },
      ],
    };
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: 'POST', url: '/api/simulate/webhook', headers: SIM_BEARER, payload });
    }

    const conv = (await listConversations(cookie)).find((c) => c.contact.wa_id === '5215533333333')!;
    const msgs = (
      await app.inject({ method: 'GET', url: `/api/conversations/${conv.id}/messages`, headers: { cookie } })
    ).json() as { items: unknown[] };
    expect(msgs.items).toHaveLength(1);
    expect(inboxId).toBeGreaterThan(0);
  });

  it('eventos de un número desconocido se descartan sin crear datos (FR-013)', async () => {
    const cookie = await loginAdmin();
    const app = await getApp();
    await createSimInbox();
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'OTRA-WABA',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: 'X', phone_number_id: 'PNID-DESCONOCIDO' },
                contacts: [{ profile: { name: 'Fantasma' }, wa_id: '5215544444444' }],
                messages: [
                  { from: '5215544444444', id: 'wamid.GHOST-1', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'hola?' } },
                ],
              },
            },
          ],
        },
      ],
    };
    const res = await app.inject({ method: 'POST', url: '/api/simulate/webhook', headers: SIM_BEARER, payload });
    expect(res.statusCode).toBe(200);
    const items = await listConversations(cookie);
    expect(items.some((c) => c.contact.wa_id === '5215544444444')).toBe(false);
  });

  it('los estados de entrega avanzan solo hacia delante (T016)', async () => {
    const cookie = await loginAdmin();
    const app = await getApp();
    const inboxId = await createSimInbox();
    await simulateIncoming({ inbox_id: inboxId, from: '5215555555555', body: 'hola' });
    const conv = (await listConversations(cookie)).find((c) => c.contact.wa_id === '5215555555555')!;

    const sent = await app.inject({
      method: 'POST',
      url: `/api/conversations/${conv.id}/messages`,
      headers: { cookie },
      payload: { type: 'text', body: 'respuesta' },
    });
    expect(sent.statusCode).toBe(201);
    const wamid = (sent.json() as { wamid: string }).wamid;

    // read y luego un delivered tardío que NO debe retroceder
    await app.inject({ method: 'POST', url: '/api/simulate/status', headers: SIM_BEARER, payload: { wamid, status: 'read' } });
    await app.inject({ method: 'POST', url: '/api/simulate/status', headers: SIM_BEARER, payload: { wamid, status: 'delivered' } });

    const msgs = (
      await app.inject({ method: 'GET', url: `/api/conversations/${conv.id}/messages`, headers: { cookie } })
    ).json() as { items: { wamid: string | null; status: string | null }[] };
    expect(msgs.items.find((m) => m.wamid === wamid)!.status).toBe('read');
  });
});
