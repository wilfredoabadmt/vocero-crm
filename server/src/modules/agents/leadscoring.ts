import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts, conversations, messages, aiAgents } from '../../db/schema.js';
import { chatCompletion } from '../../integrations/openrouter/client.js';
import { broadcast } from '../../realtime/hub.js';
import { onEvent } from '../../lib/events.js';
import { serializeConversation } from '../conversations/serialize.js';
import { getOpenRouterKey, getSetting } from '../settings/routes.js';

export function initLeadScoring() {
  console.log('Inicializando pipeline de Lead Scoring con IA...');

  // Escuchar cuando entra un mensaje del contacto
  onEvent('message:created', async (payload) => {
    if (payload.direction !== 'in') return; // Solo evaluar cuando escribe el contacto

    // Ejecutar asíncronamente
    void calculateLeadScoring(payload.conversationId).catch((err) => {
      console.error(`[LeadScoring] Error calculando puntaje para conv ${payload.conversationId}:`, err);
    });
  });
}

async function calculateLeadScoring(conversationId: number) {
  // 1. Obtener la conversación y sus últimos mensajes
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId));

  if (!conversation) return;

  // Si la IA global está deshabilitada o no hay OpenRouter key, no hacemos nada
  if ((await getSetting('ai_global_enabled')) === 'false') return;
  const apiKey = await getOpenRouterKey();
  if (!apiKey) return;

  // Obtener los últimos 15 mensajes en orden cronológico
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.id))
    .limit(15);

  if (history.length < 2) return; // Se requiere un mínimo de historial para calificar

  const chronological = [...history].reverse();
  const chatText = chronological
    .map((m) => `${m.direction === 'in' ? 'Cliente' : 'Asesor'}: ${m.body ?? '[Multimedia]'}`)
    .join('\n');

  // Elegir modelo por defecto
  let model = 'meta-llama/llama-3-8b-instruct:free'; // Fallback por defecto si no hay agentes creados
  const [defaultAgent] = await db.select().from(aiAgents).where(eq(aiAgents.isDefault, true));
  if (defaultAgent) {
    model = defaultAgent.model;
  }

  // Prompt específico para calcular la calificación
  const prompt = `Analiza la siguiente conversación de WhatsApp entre un Cliente y un Asesor del negocio. Califica la intención y el interés de compra del Cliente con un número entero del 1 al 100, donde:
- 1 a 30: Frío / Sin interés real o descarta el producto/servicio.
- 31 a 70: Tibio / Tiene preguntas, muestra curiosidad o pide precios pero duda.
- 71 a 100: Caliente / Muy interesado, listo para concretar, comprar, agendar cita o interactúa activamente.

Conversación:
"""
${chatText}
"""

Responde ÚNICAMENTE con el número entero resultante (ej. "75"), sin explicaciones, sin texto adicional, sin formato Markdown. Solo el número entero.`;

  try {
    const rawResult = await chatCompletion(apiKey, model, [
      { role: 'user', content: prompt }
    ]);

    const cleanNumber = parseInt(rawResult.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(cleanNumber) && cleanNumber >= 1 && cleanNumber <= 100) {
      // Actualizar el puntaje en el contacto
      await db
        .update(contacts)
        .set({ leadScoring: cleanNumber })
        .where(eq(contacts.id, conversation.contactId));

      console.log(`[LeadScoring] Lead de la conversación ${conversationId} calificado con: ${cleanNumber}`);

      // Notificar por WebSocket al frontend para actualizar vistas
      const summary = await serializeConversation(conversationId);
      if (summary) {
        broadcast('conversation:updated', summary);
      }
    } else {
      console.warn(`[LeadScoring] Respuesta no numérica o fuera de rango de OpenRouter: "${rawResult}"`);
    }
  } catch (err) {
    console.error('[LeadScoring] Falló la llamada a OpenRouter para Lead Scoring:', err);
  }
}
