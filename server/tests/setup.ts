import { beforeAll } from 'vitest';
import { db, runMigrations } from '../src/db/client.js';
import { seed } from '../src/db/seed.js';
import { sql } from 'drizzle-orm';

beforeAll(async () => {
  await runMigrations();
  try {
    await db.execute(
      sql`TRUNCATE TABLE messages, conversations, contacts, inboxes, users, stages, workflows, workflow_logs, settings, ai_agents, agent_documents CASCADE`
    );
  } catch {
    // Falla seguro si es la primera vez y las tablas no existen
  }
  await seed();
});
