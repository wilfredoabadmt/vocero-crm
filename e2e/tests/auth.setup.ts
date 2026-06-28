import { expect, test as setup } from '@playwright/test';
import { ADMIN } from './helpers';

const AUTH_FILE = '.auth/admin.json';

// Un solo login para toda la suite (evita el rate limit y acelera los tests)
setup('autenticar admin', async ({ request }) => {
  const res = await request.post('/api/auth/login', { data: ADMIN });
  expect(res.ok()).toBeTruthy();
  await request.storageState({ path: AUTH_FILE });
});
