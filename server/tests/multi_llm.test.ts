import { describe, expect, it } from 'vitest';
import { getApp, loginAdmin } from './helpers.js';
import { chatLlmCompletion, validateLlmKey } from '../src/integrations/llm/client.js';

describe('Multi-LLM Integración y Claves', () => {
  it('permite guardar, listar y eliminar claves de OpenAI, Gemini, Zhipu y OpenRouter', async () => {
    const app = await getApp();
    const cookie = await loginAdmin();

    const providers = ['openai', 'gemini', 'zhipu', 'openrouter'] as const;

    for (const p of providers) {
      // 1. Guardar API key simulada
      const saveRes = await app.inject({
        method: 'PUT',
        url: '/api/settings/keys',
        headers: { cookie },
        payload: { provider: p, api_key: `sk-sim-${p}-key-12345` },
      });
      expect(saveRes.statusCode).toBe(200);
      expect(saveRes.json()).toEqual({ configured: true, last4: '2345' });

      // 2. Verificar en el listado consolidado
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/settings/keys',
        headers: { cookie },
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json()[p]).toEqual({ configured: true, last4: '2345' });

      // 3. Eliminar la clave
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/settings/keys/${p}`,
        headers: { cookie },
      });
      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.json()).toEqual({ configured: false });
    }
  });

  it('valida claves y simula respuestas de completación de chat para todos los proveedores', async () => {
    const providers = ['openai', 'gemini', 'zhipu', 'openrouter'] as const;

    for (const p of providers) {
      // Validar clave simulada
      const isValid = await validateLlmKey(p, `sk-sim-${p}-test`);
      expect(isValid).toBe(true);

      // Simular completación de chat
      const reply = await chatLlmCompletion(p, `sk-sim-${p}-test`, 'any-model', [
        { role: 'user', content: 'Hola asistente, dame los precios' },
      ]);
      expect(reply).toContain(`Respuesta simulada del agente (${p}): recibido "Hola asistente, dame los precios"`);
    }
  });
});
