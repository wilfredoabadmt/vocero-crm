import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { aiAgents, contacts, conversations, messages } from '../../db/schema.js';
import { chatLlmCompletion, LlmError, type ChatMessage, type LlmProvider } from '../../integrations/llm/client.js';
import { broadcast } from '../../realtime/hub.js';
import { retrieveChunks } from '../../rag/index.js';
import { serializeConversation } from '../conversations/serialize.js';
import { windowState } from '../conversations/window.js';
import { getLlmKey, getSetting } from '../settings/routes.js';
import { sendMessage } from '../messages/send.js';
import { setAutoReplyTrigger } from './hook.js';
import { isSubscriptionActive } from '../../integrations/stripe.js';

const DEBOUNCE_MS = Number(process.env.AUTOREPLY_DEBOUNCE_MS ?? 6000);

const pendingTimers = new Map<number, NodeJS.Timeout>();

function schedule(conversationId: number) {
  const existing = pendingTimers.get(conversationId);
  if (existing) clearTimeout(existing);
  pendingTimers.set(
    conversationId,
    setTimeout(() => {
      pendingTimers.delete(conversationId);
      void runAutoReply(conversationId).catch(() => {});
    }, DEBOUNCE_MS),
  );
}

export function initAutoReply() {
  setAutoReplyTrigger(schedule);
}

async function markNeedsHuman(conversationId: number, reason: string) {
  await db
    .update(conversations)
    .set({ needsHuman: true, needsHumanReason: reason })
    .where(eq(conversations.id, conversationId));
  const summary = await serializeConversation(conversationId);
  if (summary) broadcast('conversation:updated', summary);
}

function buildSystemPrompt(agent: typeof aiAgents.$inferSelect, contactName: string | null, ragChunks: string[]): string {
  const parts: string[] = [];
  parts.push(
    `Eres "${agent.name}", un asistente de WhatsApp que responde en nombre del negocio. Respondes SIEMPRE en el idioma del cliente (por defecto español), con mensajes breves y naturales propios de WhatsApp (sin Markdown).`,
  );
  parts.push(`## Tu propósito\n${agent.purpose}`);
  if (agent.tone) parts.push(`## Tono y personalidad\n${agent.tone}`);
  if (agent.instructions) parts.push(`## Reglas de comportamiento\n${agent.instructions}`);
  if (agent.businessInfo) parts.push(`## Información del negocio\n${agent.businessInfo}`);
  if (agent.escalationRules) {
    parts.push(
      `## Cuándo escalar a un humano\n${agent.escalationRules}\nSi corresponde escalar, indícale al cliente que un asesor le responderá pronto.`,
    );
  }
  if (ragChunks.length > 0) {
    parts.push(
      `## Base de conocimiento (extractos relevantes)\nUsa esta información como fuente de verdad cuando aplique:\n\n${ragChunks
        .map((c, i) => `[${i + 1}] ${c}`)
        .join('\n\n')}`,
    );
  }
  if (contactName) parts.push(`El cliente se llama ${contactName}.`);
  parts.push('No inventes datos del negocio que no tengas. Si no sabes algo, dilo y ofrece que un asesor confirme.');
  return parts.join('\n\n');
}

function detectProvider(model: string): LlmProvider {
  // OpenCode
  if (model.startsWith('opencode//')) return 'opencode';
  // OpenAI
  if (model.startsWith('gpt-')) return 'openai';
  // Gemini
  if (model.startsWith('gemini-')) return 'gemini';
  // Zhipu
  if (model.startsWith('glm-')) return 'zhipu';
  // Ollama: modelos locales (contienen ':' como 'llama3.1:8b' o terminan en sufijos locales)
  if (model.includes(':') || model.endsWith('-local')) return 'ollama';
  // Groq
  if (model.startsWith('llama-3') && model.includes('instant')) return 'groq';
  if (model === 'gemma2-9b-it' || model === 'mixtral-8x7b-32768') return 'groq';
  // Together AI (modelos con '/' como 'meta-llama/...')
  if (model.includes('/') && !model.startsWith('sim/')) return 'together';
  // HuggingFace
  if (model.startsWith('HuggingFace') || model.startsWith('mistralai/Mistral')) return 'huggingface';
  // Mistral
  if (model.startsWith('mistral-') || model.startsWith('open-mistral')) return 'mistral';
  // OpenRouter (default para modelos con '/' de otros proveedores o sin prefijo conocido)
  return 'openrouter';
}

export async function runAutoReply(conversationId: number) {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  if (!conversation || conversation.autoReply !== 'active') return;

  const subscriptionActive = await isSubscriptionActive();
  if (!subscriptionActive) return; // Detener respuestas de IA si la licencia expiró

  if ((await getSetting('ai_global_enabled')) === 'false') return;

  // Agente asignado o, en su defecto, el agente por defecto
  let agent: typeof aiAgents.$inferSelect | undefined;
  if (conversation.assignedAgentId) {
    [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, conversation.assignedAgentId));
  }
  if (!agent) [agent] = await db.select().from(aiAgents).where(eq(aiAgents.isDefault, true));
  if (!agent) return; // sin agentes creados

  const provider = detectProvider(agent.model);
  const apiKey = await getLlmKey(provider);
  if (!apiKey) return; // IA no configurada para este proveedor: el panel opera manual

  // FR-043: ventana cerrada ⇒ la IA no responde; atención humana
  if (!windowState(conversation.lastInboundAt).open) {
    await markNeedsHuman(conversationId, 'Ventana de 24 h cerrada: responde con una plantilla');
    return;
  }

  // Historial reciente (≤20). Si el último mensaje ya no es del contacto, un humano/el bot ya respondió.
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.id))
    .limit(20);
  if (history.length === 0 || history[0]!.direction !== 'in') return;

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, conversation.contactId));

  const chronological = [...history].reverse();
  const chat: ChatMessage[] = chronological.map((m) => ({
    role: m.direction === 'in' ? 'user' : 'assistant',
    content:
      m.body ??
      (m.type === 'image' ? '[el cliente envió una imagen]' : m.type === 'audio' ? '[el cliente envió una nota de voz]' : m.type === 'document' ? '[el cliente envió un documento]' : '[mensaje multimedia]'),
  }));

  const lastInbound = chronological.filter((m) => m.direction === 'in').slice(-3);
  const query = lastInbound.map((m) => m.body ?? '').join(' ');
  const ragChunks = await retrieveChunks(agent.id, query);

  try {
    const reply = await chatLlmCompletion(provider, apiKey, agent.model, [
      { role: 'system', content: buildSystemPrompt(agent, contact?.name ?? null, ragChunks) },
      ...chat,
    ]);
    await sendMessage(conversationId, { type: 'text', body: reply }, { kind: 'ai_agent', agentId: agent.id, name: agent.name });
  } catch (err) {
    // FR-029: nada al cliente; conversación a atención humana con motivo visible
    const reason =
      err instanceof LlmError
        ? `La IA no pudo responder: ${err.message}`
        : 'La IA no pudo responder por un error inesperado';
    await markNeedsHuman(conversationId, reason);
  }
}
