// Arranca el server compilado con una DB PGlite limpia para la suite E2E.
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '.e2e-data');
rmSync(dataDir, { recursive: true, force: true });

process.env.NODE_ENV = 'production';
process.env.PORT = '3100';
process.env.DATABASE_URL = `pglite://${path.join(dataDir, 'db')}`;
process.env.UPLOADS_DIR = path.join(dataDir, 'uploads');
process.env.SIMULATION_MODE = 'true';
process.env.AUTOREPLY_DEBOUNCE_MS = '200';
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.SESSION_SECRET = 'e2e-session-secret-0123456789abcdef';
process.env.PROVISIONING_SECRET = 'e2e-provisioning-secret';
process.env.ADMIN_EMAIL = 'admin@e2e.local';
process.env.ADMIN_PASSWORD = 'e2e-admin-1234';
process.env.PUBLIC_URL = 'http://localhost:3100';

await import(pathToFileURL(path.join(here, '../server/dist/index.js')).href);
