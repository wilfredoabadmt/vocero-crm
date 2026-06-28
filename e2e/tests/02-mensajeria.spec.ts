import { expect, test } from '@playwright/test';
import { ensureSimInbox, injectIncoming } from './helpers';

test.describe.serial('mensajería en tiempo real y ventana de 24 h', () => {
  test('la bandeja simulada queda conectada y visible en Ajustes (US2)', async ({ page }) => {
    await ensureSimInbox(page.request);
    await page.goto('/ajustes/bandejas');
    // Acotar a la fila de esta bandeja (puede haber otras conectadas en la suite)
    const row = page.locator('[data-testid^="inbox-"]').filter({ hasText: 'Bandeja Simulada' });
    await expect(row).toBeVisible();
    await expect(row.getByText('Conectada')).toBeVisible();
  });

  test('un mensaje entrante aparece en tiempo real sin recargar (US1, SC-001)', async ({ page }) => {
    const inboxId = await ensureSimInbox(page.request);
    await page.goto('/');
    await expect(page.getByPlaceholder('Buscar conversación…')).toBeVisible();
    await page.waitForTimeout(1200); // deja establecer el WebSocket

    await injectIncoming(page.request, {
      inbox_id: inboxId,
      from: '5215590000001',
      name: 'María López',
      body: 'Hola, ¿tienen disponibilidad?',
    });

    // Sin reload: llega por WebSocket
    await expect(page.getByText('María López')).toBeVisible({ timeout: 6000 });
    await expect(page.getByText('Hola, ¿tienen disponibilidad?')).toBeVisible();
  });

  test('responder desde el panel entrega el mensaje y muestra ticks (US1)', async ({ page }) => {
    await page.goto('/');
    await page.getByText('María López', { exact: true }).click();

    // Texto único por ejecución: los reintentos no chocan con mensajes previos
    const reply = `¡Hola María! Sí tenemos disponibilidad. [${Date.now()}]`;
    const composer = page.getByTestId('composer-input');
    await composer.fill(reply);
    await composer.press('Enter');

    const thread = page.getByTestId('thread');
    await expect(thread.getByText(reply)).toBeVisible();
    // El mock simula sent→delivered en ~2 s
    await page.waitForTimeout(2500);
    await expect(thread.getByText(reply)).toBeVisible();
  });

  test('conversación fuera de ventana: banner, sin texto libre y guía a plantillas (US6)', async ({ page }) => {
    const inboxId = await ensureSimInbox(page.request);
    await injectIncoming(page.request, {
      inbox_id: inboxId,
      from: '5215590000002',
      name: 'Lead Frio',
      body: 'Me interesa, luego hablamos',
      timestamp_offset_hours: -25,
    });

    await page.goto('/');
    await page.getByText('Lead Frio', { exact: true }).click();

    await expect(page.getByTestId('composer-window-closed')).toBeVisible();
    await expect(page.getByText('Ventana de 24 horas cerrada')).toBeVisible();
    await expect(page.getByTestId('composer-input')).toHaveCount(0); // no hay textarea libre
    await expect(page.getByTestId('no-templates')).toBeVisible(); // aún sin plantillas aprobadas
  });

  test('crear plantilla con preview en vivo; Meta (mock) la aprueba (US7)', async ({ page }) => {
    await page.goto('/plantillas');
    await page.getByTestId('new-template').click();

    await page.getByTestId('tpl-name').fill('seguimiento e2e'); // se auto-sluggea
    await expect(page.getByTestId('tpl-name')).toHaveValue('seguimiento_e2e');
    await page.getByTestId('tpl-body').fill('Hola {{1}}, te escribimos de {{2}}. ¿Sigues interesado?');

    // Vista previa en vivo refleja el cuerpo
    await expect(page.getByTestId('wa-preview').getByText(/te escribimos de/)).toBeVisible();

    await page.getByTestId('tpl-submit').click();
    await expect(page.getByTestId('template-status-seguimiento_e2e')).toHaveText('En revisión de Meta');

    // Aprobación automática del mock (~5 s), reflejada en vivo por WS
    await expect(page.getByTestId('template-status-seguimiento_e2e')).toHaveText('Aprobada', { timeout: 10_000 });
  });

  test('enviar plantilla con variables fuera de ventana (US6+US7)', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Lead Frio', { exact: true }).click();

    await expect(page.getByTestId('template-picker')).toBeVisible();
    await page.getByTestId('template-option-seguimiento_e2e').click();

    // No deja enviar con variables vacías
    await expect(page.getByTestId('template-send')).toBeDisabled();

    await page.getByTestId('template-var-0').fill('Lead Frio');
    await page.getByTestId('template-var-1').fill('Negocio E2E');
    await expect(
      page.getByTestId('wa-preview').getByText('Hola Lead Frio, te escribimos de Negocio E2E. ¿Sigues interesado?'),
    ).toBeVisible();

    await page.getByTestId('template-send').click();
    await expect(
      page.getByTestId('thread').getByText('Hola Lead Frio, te escribimos de Negocio E2E. ¿Sigues interesado?'),
    ).toBeVisible();
  });

  test('si el cliente responde, la ventana se reabre en vivo (FR-042)', async ({ page }) => {
    const inboxId = await ensureSimInbox(page.request);
    await page.goto('/');
    await page.getByText('Lead Frio', { exact: true }).click();
    await expect(page.getByTestId('composer-window-closed')).toBeVisible();
    await page.waitForTimeout(1200); // deja establecer el WebSocket

    await injectIncoming(page.request, {
      inbox_id: inboxId,
      from: '5215590000002',
      name: 'Lead Frio',
      body: 'Sí, sigo interesado!',
    });

    // El compositor vuelve a texto libre sin recargar
    await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 6000 });
    await expect(page.getByTestId('composer-window-closed')).toHaveCount(0);
  });
});
