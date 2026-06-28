import { runMigrations, closeDb } from './client.js';
import { seed } from './seed.js';

await runMigrations();
await seed();
console.log('Migraciones y seed aplicados.');
await closeDb();
