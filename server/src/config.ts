import { z } from 'zod';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Carga .env de la raíz del repo (sin dependencia externa). No pisa vars ya definidas.
function loadDotEnv() {
  for (const dir of [process.cwd(), path.resolve(process.cwd(), '..')]) {
    const file = path.join(dir, '.env');
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1]!;
      let value = m[2]!;
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    break;
  }
}
loadDotEnv();

const isProd = process.env.NODE_ENV === 'production';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default('pglite://./data/dev-db'),
  SESSION_SECRET: isProd ? z.string().min(32) : z.string().min(8).default('dev-session-secret-no-usar'),
  PROVISIONING_SECRET: isProd ? z.string().min(16) : z.string().min(4).default('dev-provisioning-secret'),
  META_APP_SECRET: z.string().default(''),
  WEBHOOK_VERIFY_TOKEN: z.string().default(''),
  ADMIN_EMAIL: z.string().email().default('admin@panel.local'),
  ADMIN_PASSWORD: z.string().min(8).default('admin1234'),
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  SIMULATION_MODE: z
    .string()
    .default(isProd ? 'false' : 'true')
    .transform((v) => v === 'true' || v === '1'),
  UPLOADS_DIR: z.string().default('./data/uploads'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuración inválida:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const isTest = parsed.data.NODE_ENV === 'test';

export const config = {
  ...parsed.data,
  DATABASE_URL: isTest ? 'pglite://memory' : parsed.data.DATABASE_URL,
  SESSION_SECRET: isTest ? 'test-session-secret-0123456789abcdef' : parsed.data.SESSION_SECRET,
  PROVISIONING_SECRET: isTest ? 'test-provisioning-secret' : parsed.data.PROVISIONING_SECRET,
  ADMIN_EMAIL: isTest ? 'admin@test.local' : parsed.data.ADMIN_EMAIL,
  ADMIN_PASSWORD: isTest ? 'admin-test-1234' : parsed.data.ADMIN_PASSWORD,
  isProd,
  uploadsDir: path.resolve(parsed.data.UPLOADS_DIR),
};

// ---- Cifrado de secretos en reposo (tokens de bandeja, API key OpenRouter) ----
const encKey = scryptSync(config.SESSION_SECRET, 'panel-secrets-v1', 32);

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, ctB64] = stored.split('.');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Secreto almacenado corrupto');
  const decipher = createDecipheriv('aes-256-gcm', encKey, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}
