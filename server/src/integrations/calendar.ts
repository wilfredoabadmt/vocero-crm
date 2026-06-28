import { db } from '../db/client.js';
import { contacts, conversations } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Simula el agendamiento de una cita en Google Calendar.
 * En producción, esto utilizaría el cliente de la API de Google (googleapis) con tokens OAuth2.
 */
export async function mockScheduleEvent(conversationId: number, messageBody: string) {
  // Buscar información del contacto
  const [conv] = await db
    .select({ contactId: conversations.contactId })
    .from(conversations)
    .where(eq(conversations.id, conversationId));

  if (!conv) return;

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, conv.contactId));

  const contactName = contact?.name ?? contact?.waId ?? 'Cliente Desconocido';
  const contactPhone = contact?.phone ?? '';

  // Extraer información básica del mensaje para el evento
  let dateText = 'Próximos días';
  const dateMatch = messageBody.match(/(lunes|martes|miércoles|jueves|viernes|sábado|domingo|\d{1,2}\/\d{1,2}|\d{1,2}\s+de\s+[a-z]+)/i);
  if (dateMatch && dateMatch[0]) {
    dateText = dateMatch[0];
  }

  console.log('--------------------------------------------------');
  console.log('[Google Calendar MOCK] ¡Nueva cita agendada!');
  console.log(`- Cliente: ${contactName} (${contactPhone})`);
  console.log(`- Evento: Asesoría comercial - CRM TOI`);
  console.log(`- Fecha sugerida/detectada: ${dateText}`);
  console.log(`- Origen del trigger: "${messageBody}"`);
  console.log('--------------------------------------------------');
}

/**
 * Escucha e intercepta textos de chat para detectar si se está confirmando una cita.
 */
export async function detectAndScheduleAppointment(conversationId: number, body: string | null) {
  if (!body) return;

  const lowercaseBody = body.toLowerCase();
  const appointmentKeywords = [
    'cita confirmada',
    'reunión agendada',
    'reunion agendada',
    'cita programada',
    'cita reservada',
    'evento agendado'
  ];

  const matches = appointmentKeywords.some((keyword) => lowercaseBody.includes(keyword));

  if (matches) {
    void mockScheduleEvent(conversationId, body).catch((err) => {
      console.error('[Google Calendar] Error al simular agendamiento:', err);
    });
  }
}
