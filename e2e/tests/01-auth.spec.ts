import { expect, test } from '@playwright/test';
import { ADMIN } from './helpers';

// Estos tests ejercitan el login desde cero: sin sesión previa
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('autenticación y tema', () => {
  test('credenciales inválidas muestran error claro', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Correo electrónico').fill(ADMIN.email);
    await page.getByLabel('Contraseña').fill('contraseña-mala');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByText('Correo o contraseña incorrectos')).toBeVisible();
  });

  test('login correcto lleva a la bandeja de entrada', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Correo electrónico').fill(ADMIN.email);
    await page.getByLabel('Contraseña').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByPlaceholder('Buscar conversación…')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bandeja de entrada' })).toBeVisible();
  });

  test('tras iniciar sesión, los mensajes llegan en vivo sin recargar (regresión WS)', async ({ page, request }) => {
    // Bandeja simulada lista antes de loguear
    const prov = await request.post('/api/simulate/provisioning', {
      headers: { authorization: 'Bearer e2e-provisioning-secret' },
      data: { phone_number_id: 'SIM-PNID-WSFIX', business_name: 'Bandeja WS Fix' },
    });
    const inboxId = ((await prov.json()) as { inbox_id: number }).inbox_id;

    // Primer load DESLOGUEADO (aquí el WS recibe 4401) y luego login por formulario
    await page.goto('/');
    await page.getByLabel('Correo electrónico').fill(ADMIN.email);
    await page.getByLabel('Contraseña').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByPlaceholder('Buscar conversación…')).toBeVisible();
    await page.waitForTimeout(2500); // el WS se reconecta tras el login

    // Inyectar SIN recargar
    await request.post('/api/simulate/incoming-message', {
      headers: { authorization: 'Bearer e2e-provisioning-secret' },
      data: { inbox_id: inboxId, from: '5215512349999', name: 'Cliente WS', body: 'llego en vivo' },
    });

    await expect(page.getByText('Cliente WS')).toBeVisible({ timeout: 6000 });
  });

  test('el modo oscuro se activa y persiste tras recargar (US9)', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Correo electrónico').fill(ADMIN.email);
    await page.getByLabel('Contraseña').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByPlaceholder('Buscar conversación…')).toBeVisible();

    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('menuitem', { name: /Oscuro/ }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);

    // volver a claro para el resto de la suite
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('menuitem', { name: /Claro/ }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
});
