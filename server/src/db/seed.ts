import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from './client.js';
import { stages, users, inboxes, contacts, conversations, messages } from './schema.js';

const DEFAULT_STAGES = ['Nuevo', 'En conversación', 'Calificado', 'Cerrado'];

/** Seed idempotente: 4 etapas del embudo + admin inicial + datos demo en desarrollo. */
export async function seed() {
  const existingStages = await db.select().from(stages);
  if (existingStages.length === 0) {
    await db.insert(stages).values(DEFAULT_STAGES.map((name, i) => ({ name, position: i + 1 })));
  }

  const [admin] = await db.select().from(users).where(eq(users.email, config.ADMIN_EMAIL.toLowerCase()));
  if (!admin) {
    await db.insert(users).values({
      email: config.ADMIN_EMAIL.toLowerCase(),
      name: 'Administrador',
      passwordHash: await hash(config.ADMIN_PASSWORD),
      role: 'admin',
    });
  }

  // Poblar bandeja, lead y mensajes demo en desarrollo local
  const existingInboxes = await db.select().from(inboxes);
  if (existingInboxes.length === 0) {
    const [inbox] = await db.insert(inboxes).values({
      name: 'WhatsApp Demo',
      status: 'connected',
      displayPhoneNumber: '+52 1 55 8000 0000',
      wabaId: 'waba-demo-id',
      phoneNumberId: 'phone-demo-id',
    }).returning();

    if (inbox) {
      const [stage1] = await db.select().from(stages).where(eq(stages.position, 1));
      if (stage1) {
        const [contact] = await db.insert(contacts).values({
          inboxId: inbox.id,
          waId: '5215580000001',
          name: 'Carlos Mendoza',
          phone: '+52 1 55 8000 0001',
          stageId: stage1.id,
          leadScoring: 85,
        }).returning();

        if (contact) {
          const [conversation] = await db.insert(conversations).values({
            inboxId: inbox.id,
            contactId: contact.id,
            lastMessagePreview: '¿Tienen disponibilidad para una asesoría de CRM mañana?',
            lastMessageAt: new Date(),
            unreadCount: 0,
            autoReply: 'active',
            needsHuman: true,
            needsHumanReason: 'Conversación inicial',
          }).returning();

          if (conversation) {
            await db.insert(messages).values([
              {
                conversationId: conversation.id,
                direction: 'in',
                authorType: 'contact',
                type: 'text',
                body: 'Hola, buenas tardes.',
                createdAt: new Date(Date.now() - 3600 * 1000),
              },
              {
                conversationId: conversation.id,
                direction: 'out',
                authorType: 'user',
                type: 'text',
                body: 'Hola Carlos, un gusto saludarte. ¿En qué te puedo colaborar hoy?',
                createdAt: new Date(Date.now() - 1800 * 1000),
              },
              {
                conversationId: conversation.id,
                direction: 'in',
                authorType: 'contact',
                type: 'text',
                body: '¿Tienen disponibilidad para una asesoría de CRM mañana? Me interesa cotizar.',
                createdAt: new Date(Date.now() - 600 * 1000),
              }
            ]);
          }
        }
      }
    }
  }
}
