import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import * as schema from './schema.js';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

export type Db = ReturnType<typeof drizzlePg<typeof schema>>;

let db: Db;
let runMigrations: () => Promise<void>;
let closeDb: () => Promise<void>;

if (config.DATABASE_URL.startsWith('pglite://')) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { mkdirSync } = await import('node:fs');
  const target = config.DATABASE_URL.slice('pglite://'.length);
  // 'memory' = efímero (tests); cualquier otra cosa = ruta de persistencia en disco
  let pglite: InstanceType<typeof PGlite>;
  if (target === 'memory') {
    pglite = new PGlite();
  } else {
    // Resolver de forma absoluta relativa a este archivo de base de datos para consistencia
    const dir = path.isAbsolute(target)
      ? target
      : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../', target);
    mkdirSync(dir, { recursive: true });
    pglite = new PGlite(dir);
  }
  const instance = drizzlePglite(pglite, { schema });
  db = instance as unknown as Db;
  runMigrations = async () => migratePglite(instance, { migrationsFolder });
  closeDb = async () => pglite.close();

  if (target === 'memory') {
    await runMigrations();
  }
} else {
  const client = postgres(config.DATABASE_URL, { max: 10, onnotice: () => {} });
  const instance = drizzlePg(client, { schema });
  db = instance;
  runMigrations = async () => {
    const migrationClient = postgres(config.DATABASE_URL, { max: 1, onnotice: () => {} });
    await migratePg(drizzlePg(migrationClient, { schema }), { migrationsFolder });
    await migrationClient.end();
  };
  closeDb = async () => client.end();
}

export { db, runMigrations, closeDb, schema };
