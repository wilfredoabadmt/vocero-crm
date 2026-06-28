import { describe, expect, it } from 'vitest';
import { getApp, loginAdmin } from './helpers.js';
import { db } from '../src/db/client.js';
import { stages, contacts } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('Etapas del Kanban Dinámicas', () => {
  it('ciclo de vida de etapas: creación, bloqueo de borrado con leads, reordenamiento tras borrado', async () => {
    const app = await getApp();
    const cookie = await loginAdmin();

    // 1. Obtener etapas iniciales
    const initialRes = await app.inject({
      method: 'GET',
      url: '/api/stages',
      headers: { cookie },
    });
    expect(initialRes.statusCode).toBe(200);
    const initialStages = (initialRes.json() as { items: any[] }).items;
    const initialCount = initialStages.length;

    // 2. Crear una nueva etapa
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/stages',
      headers: { cookie },
      payload: { name: 'Etapa de Prueba' },
    });
    expect(createRes.statusCode).toBe(201);
    const newStage = createRes.json() as { id: number; name: string; position: number };
    expect(newStage.name).toBe('Etapa de Prueba');
    expect(newStage.position).toBe(initialCount + 1);

    // 3. Crear un lead y asociarlo a esta nueva etapa
    // Para simplificar, insertaremos directamente en la base de datos para no lidiar con dependencias de bandejas en la simulación
    const [inbox] = await db.select().from(stages).limit(1); // Necesitamos cualquier inboxId válido para el contacto, pero usemos drizzle directo
    const [firstInbox] = await db.select().from(contacts).limit(1); // Usemos un inboxId que ya exista
    let inboxId = 1;
    if (firstInbox) inboxId = firstInbox.inboxId;

    const [testContact] = await db
      .insert(contacts)
      .values({
        inboxId,
        waId: '5215599999999',
        name: 'Lead de Test de Etapa',
        stageId: newStage.id,
      })
      .returning();

    // 4. Intentar eliminar la etapa que tiene leads y verificar que falle con 400
    const deleteFailRes = await app.inject({
      method: 'DELETE',
      url: `/api/stages/${newStage.id}`,
      headers: { cookie },
    });
    expect(deleteFailRes.statusCode).toBe(400);
    expect(deleteFailRes.json().error.code).toBe('STAGE_HAS_LEADS');

    // 5. Mover/Eliminar el lead de la etapa para poder borrarla
    await db.delete(contacts).where(eq(contacts.id, testContact!.id));

    // 6. Eliminar la etapa vacía y verificar que pase con 200
    const deleteOkRes = await app.inject({
      method: 'DELETE',
      url: `/api/stages/${newStage.id}`,
      headers: { cookie },
    });
    expect(deleteOkRes.statusCode).toBe(200);

    // 7. Verificar que las posiciones se reordenen correctamente
    const finalRes = await app.inject({
      method: 'GET',
      url: '/api/stages',
      headers: { cookie },
    });
    const finalStages = (finalRes.json() as { items: any[] }).items;
    expect(finalStages.length).toBe(initialCount);

    // Comprobar que las posiciones sean consecutivas (1, 2, 3...)
    finalStages.forEach((s, idx) => {
      expect(s.position).toBe(idx + 1);
    });
  });
});
