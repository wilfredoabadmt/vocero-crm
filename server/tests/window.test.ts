import { describe, expect, it } from 'vitest';
import { windowState, WINDOW_MS } from '../src/modules/conversations/window.js';
import { createSimInbox, getApp, loginAdmin, simulateIncoming } from './helpers.js';
import type { ConversationSummary } from '../src/modules/conversations/serialize.js';

describe('cálculo de ventana de 24 h (unidad)', () => {
  const now = new Date('2026-06-12T12:00:00Z');

  it('sin mensaje entrante ⇒ cerrada (regla conservadora)', () => {
    expect(windowState(null, now).open).toBe(false);
    expect(windowState(undefined, now).open).toBe(false);
    expect(windowState(new Date('invalid'), now).open).toBe(false);
  });

  it('límites exactos: 23h59m abierta, 24h en punto cerrada', () => {
    const justInside = new Date(now.getTime() - WINDOW_MS + 60_000);
    const exactly = new Date(now.getTime() - WINDOW_MS);
    const outside = new Date(now.getTime() - WINDOW_MS - 1);
    expect(windowState(justInside, now).open).toBe(true);
    expect(windowState(exactly, now).open).toBe(false);
    expect(windowState(outside, now).open).toBe(false);
  });

  it('expiresAt = último entrante + 24 h', () => {
    const last = new Date(now.getTime() - 1000);
    expect(windowState(last, now).expiresAt).toBe(new Date(last.getTime() + WINDOW_MS).toISOString());
  });
});

describe('aplicación de la ventana en envíos (T044)', () => {
  async function staleConversation(from: string): Promise<{ id: number; cookie: string }> {
    const cookie = await loginAdmin();
    const app = await getApp();
    const inboxId = await createSimInbox();
    await simulateIncoming({ inbox_id: inboxId, from, body: 'mensaje viejo', timestamp_offset_hours: -25 });
    const items = (
      (await app.inject({ method: 'GET', url: '/api/conversations', headers: { cookie } })).json() as {
        items: ConversationSummary[];
      }
    ).items;
    return { id: items.find((c) => c.contact.wa_id === from)!.id, cookie };
  }

  it('texto libre fuera de ventana ⇒ 422 WINDOW_CLOSED (humano)', async () => {
    const app = await getApp();
    const { id, cookie } = await staleConversation('5215560000001');
    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${id}/messages`,
      headers: { cookie },
      payload: { type: 'text', body: 'esto no debe salir' },
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error: { code: string } }).error.code).toBe('WINDOW_CLOSED');
  });

  it('la conversación expone window.open=false y expiresAt', async () => {
    const app = await getApp();
    const { id, cookie } = await staleConversation('5215560000002');
    const conv = (
      await app.inject({ method: 'GET', url: `/api/conversations/${id}`, headers: { cookie } })
    ).json() as ConversationSummary;
    expect(conv.window.open).toBe(false);
    expect(conv.window.expiresAt).not.toBeNull();
  });

  it('un mensaje entrante nuevo reabre la ventana (FR-042)', async () => {
    const app = await getApp();
    const { id, cookie } = await staleConversation('5215560000003');
    await simulateIncoming({ inbox_id: 1, from: '5215560000003', body: 'ya volví' });

    const conv = (
      await app.inject({ method: 'GET', url: `/api/conversations/${id}`, headers: { cookie } })
    ).json() as ConversationSummary;
    expect(conv.window.open).toBe(true);

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${id}/messages`,
      headers: { cookie },
      payload: { type: 'text', body: 'ahora sí puedo escribir' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('un entrante con timestamp más viejo NO retrocede la ventana', async () => {
    const app = await getApp();
    const cookie = await loginAdmin();
    const inboxId = await createSimInbox();
    await simulateIncoming({ inbox_id: inboxId, from: '5215560000004', body: 'reciente' });
    await simulateIncoming({ inbox_id: inboxId, from: '5215560000004', body: 'llegó tarde', timestamp_offset_hours: -30 });

    const items = (
      (await app.inject({ method: 'GET', url: '/api/conversations', headers: { cookie } })).json() as {
        items: ConversationSummary[];
      }
    ).items;
    expect(items.find((c) => c.contact.wa_id === '5215560000004')!.window.open).toBe(true);
  });
});
