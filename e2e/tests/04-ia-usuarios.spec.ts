import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { ensureSimInbox, injectIncoming } from './helpers';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

test.describe.serial('agentes IA y usuarios', () => {
  test('configurar la API key de OpenRouter (validada y enmascarada)', async ({ page }) => {
    await page.goto('/ajustes/ia');
    await page.getByTestId('or-key-input').fill('sk-sim-e2e-key-12345');
    await page.getByTestId('or-key-save').click();
    await expect(page.getByTestId('key-configured')).toBeVisible();
    await expect(page.getByTestId('key-configured')).toContainText('2345'); // solo last4
  });

  test('crear un agente con el wizard completo, incluido un documento (US5, SC-006)', async ({ page }) => {
    await page.goto('/agentes');
    await page.getByTestId('new-agent').click();

    // Paso 1: identidad
    await page.getByTestId('agent-name').fill('Sofía');
    await page
      .getByTestId('agent-purpose')
      .fill('Atender clientes interesados en nuestros tours y resolver dudas de precios y horarios.');
    await page.getByTestId('wizard-next').click();

    // Paso 2: comportamiento
    await page.getByLabel(/Reglas de comportamiento/).fill('Responde en máximo 3 oraciones. No prometas descuentos.');
    await page.getByTestId('wizard-next').click();

    // Paso 3: documento de conocimiento
    await page.getByTestId('doc-input').setInputFiles(path.join(fixtures, 'faq.txt'));
    await expect(page.getByText('faq.txt')).toBeVisible();
    await expect(page.getByText('Listo')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('wizard-next').click();

    // Paso 4: modelo (con clave sk-sim hay modelos simulados)
    await page.getByTestId('model-search').fill('eco');
    await page.getByTestId('model-sim/echo-model').click();
    await page.getByTestId('wizard-next').click();

    // Paso 5: revisión y crear
    await page.getByTestId('wizard-finish').click();
    await expect(page.getByText('Agente creado y listo para responder')).toBeVisible();
    await expect(page.getByText('Por defecto')).toBeVisible(); // el primero es default
  });

  test('el agente por defecto responde automáticamente un mensaje entrante (US5, SC-005)', async ({ page }) => {
    const inboxId = await ensureSimInbox(page.request);
    await page.goto('/');

    await injectIncoming(page.request, {
      inbox_id: inboxId,
      from: '5215590000010',
      name: 'Cliente IA',
      body: '¿Cuánto cuesta el tour premium?',
    });
    await page.getByText('Cliente IA', { exact: true }).click();

    // La respuesta llega tras el debounce (200 ms en e2e) y se marca como del agente
    const thread = page.getByTestId('thread');
    await expect(thread.getByText(/Respuesta simulada del agente/)).toBeVisible({ timeout: 8000 });
    await expect(thread.getByText('Sofía', { exact: true })).toBeVisible();
  });

  test('responder como humano pausa la IA; el toggle la reactiva (FR-027)', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Cliente IA', { exact: true }).click();

    const toggle = page.getByTestId('auto-reply-toggle');
    await expect(toggle).toHaveAttribute('data-state', 'checked');

    const composer = page.getByTestId('composer-input');
    await composer.fill('Te atiendo personalmente');
    await composer.press('Enter');
    await expect(toggle).toHaveAttribute('data-state', 'unchecked', { timeout: 5000 });

    await toggle.click();
    await expect(toggle).toHaveAttribute('data-state', 'checked');
  });

  test('crear un asesor desde la UI y verlo en la lista (US8)', async ({ page }) => {
    await page.goto('/ajustes/usuarios');
    await page.getByTestId('new-user').click();
    await page.getByTestId('user-name').fill('Carlos Asesor');
    await page.getByTestId('user-email').fill('carlos@e2e.local');
    await page.getByTestId('user-password').fill('password-carlos-1');
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('user-row-carlos@e2e.local')).toBeVisible();
  });

  test('un asesor no ve Configuración ni puede usar rutas admin (US8)', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:3100' });
    // login del asesor por API (deja la cookie en el contexto)
    const login = await ctx.request.post('/api/auth/login', {
      data: { email: 'carlos@e2e.local', password: 'password-carlos-1' },
    });
    expect(login.ok()).toBeTruthy();

    // la API rechaza rutas admin para el asesor
    const res = await ctx.request.get('/api/users');
    expect(res.status()).toBe(403);

    // y la UI no muestra el acceso a Configuración
    const agentPage = await ctx.newPage();
    await agentPage.goto('/');
    await expect(agentPage.getByPlaceholder('Buscar conversación…')).toBeVisible();
    await expect(agentPage.getByRole('link', { name: 'Configuración' })).toHaveCount(0);
    await ctx.close();
  });

  test('desactivar al asesor invalida su sesión al instante (FR-032)', async ({ page, browser }) => {
    // sesión activa del asesor
    const ctx = await browser.newContext({ baseURL: 'http://localhost:3100' });
    const agentPage = await ctx.newPage();
    const login = await agentPage.request.post('/api/auth/login', {
      data: { email: 'carlos@e2e.local', password: 'password-carlos-1' },
    });
    expect(login.ok()).toBeTruthy();

    await page.goto('/ajustes/usuarios');
    await page.getByTestId('user-active-carlos@e2e.local').click();
    await expect(page.getByText(/sesiones fueron cerradas/)).toBeVisible();

    const me = await agentPage.request.get('/api/auth/me');
    expect(me.status()).toBe(401);
    await ctx.close();
  });
});
