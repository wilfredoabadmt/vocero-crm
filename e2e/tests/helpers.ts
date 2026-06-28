import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const ADMIN = { email: 'admin@e2e.local', password: 'e2e-admin-1234' };
export const SIM_HEADERS = { authorization: 'Bearer e2e-provisioning-secret' };

/** Login por API: deja la cookie de sesión en el contexto del navegador. */
export async function loginAsAdmin(page: Page) {
  const res = await page.request.post('/api/auth/login', { data: ADMIN });
  expect(res.ok()).toBeTruthy();
}

export async function ensureSimInbox(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/simulate/provisioning', {
    headers: SIM_HEADERS,
    data: { phone_number_id: 'SIM-PNID-E2E' },
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { inbox_id: number }).inbox_id;
}

export async function injectIncoming(
  request: APIRequestContext,
  opts: { inbox_id: number; from: string; body: string; name?: string; timestamp_offset_hours?: number },
) {
  const res = await request.post('/api/simulate/incoming-message', {
    headers: SIM_HEADERS,
    data: { name: 'Cliente E2E', type: 'text', ...opts },
  });
  expect(res.ok()).toBeTruthy();
}
