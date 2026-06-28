import { describe, expect, it } from 'vitest';
import { createSimInbox, getApp, loginAdmin, simulateIncoming, sleep } from './helpers.js';
import type { ConversationSummary } from '../src/modules/conversations/serialize.js';

interface Msg {
  author_type: string;
  body: string | null;
  direction: string;
}

async function setupAi(cookie: string) {
  const app = await getApp();
  // key simulada (no gasta crédito) + agente por defecto
  const key = await app.inject({
    method: 'PUT',
    url: '/api/settings/openrouter-key',
    headers: { cookie },
    payload: { api_key: 'sk-sim-test-key' },
  });
  expect(key.statusCode).toBe(200);
  const agent = await app.inject({
    method: 'POST',
    url: '/api/agents',
    headers: { cookie },
    payload: {
      name: 'Sofía',
      purpose: 'Atender clientes del negocio de prueba',
      tone: 'amable',
      model: 'sim/echo-model',
    },
  });
  expect(agent.statusCode).toBe(201);
  expect((agent.json() as { is_default: boolean }).is_default).toBe(true); // el primero es default
  return (agent.json() as { id: number }).id;
}

async function findConv(cookie: string, waId: string): Promise<ConversationSummary> {
  const app = await getApp();
  const items = (
    (await app.inject({ method: 'GET', url: '/api/conversations', headers: { cookie } })).json() as {
      items: ConversationSummary[];
    }
  ).items;
  return items.find((c) => c.contact.wa_id === waId)!;
}

async function getMessages(cookie: string, convId: number): Promise<Msg[]> {
  const app = await getApp();
  return (
    (await app.inject({ method: 'GET', url: `/api/conversations/${convId}/messages`, headers: { cookie } })).json() as {
      items: Msg[];
    }
  ).items;
}

describe('respuesta automática (T054)', () => {
  it('el agente por defecto responde tras el debounce', async () => {
    const cookie = await loginAdmin();
    await setupAi(cookie);
    const inboxId = await createSimInbox();
    await simulateIncoming({ inbox_id: inboxId, from: '5215580000001', body: '¿Tienen disponibilidad mañana?' });
    await sleep(900); // debounce 100ms + procesamiento

    const conv = await findConv(cookie, '5215580000001');
    const msgs = await getMessages(cookie, conv.id);
    const aiReply = msgs.find((m) => m.author_type === 'ai_agent');
    expect(aiReply).toBeDefined();
    expect(aiReply!.body).toContain('Respuesta simulada del agente');
  });

  it('ráfaga de mensajes ⇒ UNA sola respuesta (debounce agrupa)', async () => {
    const cookie = await loginAdmin();
    const inboxId = await createSimInbox();
    await simulateIncoming({ inbox_id: inboxId, from: '5215580000002', body: 'hola' });
    await simulateIncoming({ inbox_id: inboxId, from: '5215580000002', body: 'una duda' });
    await simulateIncoming({ inbox_id: inboxId, from: '5215580000002', body: '¿precios?' });
    await sleep(900);

    const conv = await findConv(cookie, '5215580000002');
    const msgs = await getMessages(cookie, conv.id);
    expect(msgs.filter((m) => m.author_type === 'ai_agent')).toHaveLength(1);
  });

  it('responder como humano pausa la auto-respuesta (FR-027)', async () => {
    const cookie = await loginAdmin();
    const app = await getApp();
    const inboxId = await createSimInbox();
    await simulateIncoming({ inbox_id: inboxId, from: '5215580000003', body: 'hola' });
    await sleep(900);
    const conv = await findConv(cookie, '5215580000003');

    await app.inject({
      method: 'POST',
      url: `/api/conversations/${conv.id}/messages`,
      headers: { cookie },
      payload: { type: 'text', body: 'te atiendo yo' },
    });
    const after = await findConv(cookie, '5215580000003');
    expect(after.auto_reply).toBe('paused');

    // siguiente entrante NO genera respuesta IA
    await simulateIncoming({ inbox_id: inboxId, from: '5215580000003', body: 'ok gracias' });
    await sleep(900);
    const msgs = await getMessages(cookie, conv.id);
    expect(msgs.filter((m) => m.author_type === 'ai_agent')).toHaveLength(1); // solo la primera
  });

  it('ventana cerrada ⇒ la IA NO responde y marca needs_human (FR-043)', async () => {
    const cookie = await loginAdmin();
    const inboxId = await createSimInbox();
    await simulateIncoming({ inbox_id: inboxId, from: '5215580000004', body: 'viejo', timestamp_offset_hours: -25 });
    await sleep(900);

    const conv = await findConv(cookie, '5215580000004');
    expect(conv.needs_human).toBe(true);
    expect(conv.needs_human_reason).toContain('24');
    const msgs = await getMessages(cookie, conv.id);
    expect(msgs.filter((m) => m.direction === 'out')).toHaveLength(0); // nada salió al cliente
  });

  it('toggle global apagado ⇒ sin respuestas automáticas', async () => {
    const cookie = await loginAdmin();
    const app = await getApp();
    await app.inject({ method: 'PUT', url: '/api/settings/ai', headers: { cookie }, payload: { enabled: false } });
    const inboxId = await createSimInbox();
    await simulateIncoming({ inbox_id: inboxId, from: '5215580000005', body: 'hola' });
    await sleep(900);
    const conv = await findConv(cookie, '5215580000005');
    const msgs = await getMessages(cookie, conv.id);
    expect(msgs.filter((m) => m.author_type === 'ai_agent')).toHaveLength(0);
    await app.inject({ method: 'PUT', url: '/api/settings/ai', headers: { cookie }, payload: { enabled: true } });
  });

  it('no se puede eliminar el agente default si hay más agentes (FR-028)', async () => {
    const cookie = await loginAdmin();
    const app = await getApp();
    const agents = (
      (await app.inject({ method: 'GET', url: '/api/agents', headers: { cookie } })).json() as {
        items: { id: number; is_default: boolean }[];
      }
    ).items;
    const defaultAgent = agents.find((a) => a.is_default)!;
    await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: { cookie },
      payload: { name: 'Secundario', purpose: 'apoyo', model: 'sim/echo-model' },
    });
    const del = await app.inject({ method: 'DELETE', url: `/api/agents/${defaultAgent.id}`, headers: { cookie } });
    expect(del.statusCode).toBe(409);
    expect((del.json() as { error: { code: string } }).error.code).toBe('DEFAULT_AGENT_REQUIRED');
  });
});
