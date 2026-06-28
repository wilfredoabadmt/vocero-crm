import { lt } from 'drizzle-orm';
import { buildApp } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/client.js';
import { seed } from './db/seed.js';
import { db } from './db/client.js';
import { webhookEvents } from './db/schema.js';
import { purgeExpiredSessions } from './auth/service.js';
import { sweepStalePendingInboxes } from './modules/inboxes/provisioning.js';

await runMigrations();
await seed();

// Mantenimiento al arranque
await purgeExpiredSessions().catch(() => {});
await db
  .delete(webhookEvents)
  .where(lt(webhookEvents.createdAt, new Date(Date.now() - 30 * 24 * 3600 * 1000)))
  .catch(() => {});

const app = await buildApp();

// Sweep periódico de bandejas pending expiradas (10 min)
const sweepInterval = setInterval(() => void sweepStalePendingInboxes().catch(() => {}), 60_000);
sweepInterval.unref();

await app.listen({ port: config.PORT, host: '0.0.0.0' });
app.log.info(
  `Panel listo en puerto ${config.PORT} (simulación: ${config.SIMULATION_MODE ? 'ACTIVA' : 'apagada'})`,
);
