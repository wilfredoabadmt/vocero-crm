import { describe, expect, it, vi } from 'vitest';
import { createSimInbox, getApp, loginAdmin, simulateIncoming, sleep } from './helpers.js';

describe('motor de automatizaciones (workflows)', () => {
  it('se dispara una acción al mover un lead de etapa en el Kanban', async () => {
    const cookie = await loginAdmin();
    const app = await getApp();
    const inboxId = await createSimInbox();

    // 1. Crear un lead simulado enviando un mensaje entrante
    await simulateIncoming({ inbox_id: inboxId, from: '5215580000009', body: 'Hola' });
    await sleep(200);

    // Obtener la conversación creada
    const convsRes = await app.inject({
      method: 'GET',
      url: '/api/conversations',
      headers: { cookie },
    });
    const items = (convsRes.json() as any).items;
    const conv = items.find((c: any) => c.contact.wa_id === '5215580000009');
    expect(conv).toBeDefined();
    const contactId = conv.contact.id;

    // 2. Crear una regla de automatización:
    // Al pasar a la etapa 2, simular enviar un correo mock y asignar un agente IA
    const workflowRes = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { cookie },
      payload: {
        name: 'Prueba de etapa',
        trigger: 'lead_stage_changed',
        conditions: { stageId: 2 },
        actions: [
          { type: 'send_email_mock', emailTo: 'test@negocio.local', emailBody: 'Lead calificado' }
        ],
        isActive: true,
      },
    });
    expect(workflowRes.statusCode).toBe(201);
    const ruleId = workflowRes.json().id;

    // 3. Mover el contacto a la etapa 2
    const moveRes = await app.inject({
      method: 'PATCH',
      url: `/api/contacts/${contactId}`,
      headers: { cookie },
      payload: { stage_id: 2 },
    });
    expect(moveRes.statusCode).toBe(200);

    // Esperar a que la ejecución asíncrona del motor de flujos termine
    await sleep(400);

    // 4. Consultar los logs de auditoría para verificar que se ejecutó con éxito
    const logsRes = await app.inject({
      method: 'GET',
      url: '/api/workflows/logs',
      headers: { cookie },
    });
    expect(logsRes.statusCode).toBe(200);
    const logs = (logsRes.json() as any).items;
    
    const ruleLog = logs.find((l: any) => l.workflow_id === ruleId);
    expect(ruleLog).toBeDefined();
    expect(ruleLog.status).toBe('success');
    expect(ruleLog.contact_name).toContain('5215580000009');
  });

  it('ejecuta la acción trigger_n8n_webhook al mover un lead de etapa', async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      })
    );
    const originalFetch = global.fetch;
    global.fetch = mockFetch as any;

    try {
      const cookie = await loginAdmin();
      const app = await getApp();
      const inboxId = await createSimInbox();

      // 1. Crear un lead simulado
      await simulateIncoming({ inbox_id: inboxId, from: '5215580000010', body: 'Quiero n8n' });
      await sleep(200);

      // Obtener la conversación creada
      const convsRes = await app.inject({
        method: 'GET',
        url: '/api/conversations',
        headers: { cookie },
      });
      const items = (convsRes.json() as any).items;
      const conv = items.find((c: any) => c.contact.wa_id === '5215580000010');
      expect(conv).toBeDefined();
      const contactId = conv.contact.id;

      // 2. Crear una regla de automatización con la acción trigger_n8n_webhook
      const workflowRes = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: { cookie },
        payload: {
          name: 'Enviar a n8n',
          trigger: 'lead_stage_changed',
          conditions: { stageId: 3 },
          actions: [
            { type: 'trigger_n8n_webhook', n8nWebhookUrl: 'https://n8n.negocio.local/webhook/test' }
          ],
          isActive: true,
        },
      });
      expect(workflowRes.statusCode).toBe(201);
      const ruleId = workflowRes.json().id;

      // 3. Mover el contacto a la etapa 3
      const moveRes = await app.inject({
        method: 'PATCH',
        url: `/api/contacts/${contactId}`,
        headers: { cookie },
        payload: { stage_id: 3 },
      });
      expect(moveRes.statusCode).toBe(200);

      // Esperar a que el motor de flujos despache el webhook
      await sleep(400);

      // 4. Consultar los logs de auditoría
      const logsRes = await app.inject({
        method: 'GET',
        url: '/api/workflows/logs',
        headers: { cookie },
      });
      const logs = (logsRes.json() as any).items;
      const ruleLog = logs.find((l: any) => l.workflow_id === ruleId);

      expect(ruleLog).toBeDefined();
      expect(ruleLog.status).toBe('success');

      // Verificar la llamada fetch
      expect(mockFetch).toHaveBeenCalled();
      const lastCall = mockFetch.mock.calls[0];
      expect(lastCall[0]).toBe('https://n8n.negocio.local/webhook/test');
      
      const parsedBody = JSON.parse(lastCall[1].body);
      expect(parsedBody.contact.wa_id).toBe('5215580000010');
      expect(parsedBody.event).toBe('lead_stage_changed');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
