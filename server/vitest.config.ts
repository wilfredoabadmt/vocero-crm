import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    fileParallelism: false, // PGlite + WASM: un archivo a la vez, cada uno con DB en memoria propia
    isolate: true,
    testTimeout: 15000,
    hookTimeout: 20000,
    setupFiles: ['tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'pglite://memory',
      SIMULATION_MODE: 'true',
      AUTOREPLY_DEBOUNCE_MS: '100',
      SESSION_SECRET: 'test-session-secret-0123456789abcdef',
      PROVISIONING_SECRET: 'test-provisioning-secret',
      ADMIN_EMAIL: 'admin@test.local',
      ADMIN_PASSWORD: 'admin-test-1234',
      UPLOADS_DIR: './data/test-uploads',
      PUBLIC_URL: 'http://localhost:3000',
    },
  },
});
