import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { aiAgents, contactTags, contacts, conversations, stages, tags } from '../../db/schema.js';
import { windowState } from './window.js';

export interface ConversationSummary {
  id: number;
  inbox_id: number;
  contact: { id: number; name: string | null; phone: string | null; wa_id: string; stage_id: number; lead_scoring: number | null };
  tags: { id: number; name: string; color: string }[];
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  auto_reply: 'active' | 'paused';
  assigned_agent: { id: number; name: string } | null;
  needs_human: boolean;
  needs_human_reason: string | null;
  window: { open: boolean; expiresAt: string | null };
}

export async function serializeConversations(ids: number[]): Promise<ConversationSummary[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      conv: conversations,
      contact: contacts,
      agentId: aiAgents.id,
      agentName: aiAgents.name,
    })
    .from(conversations)
    .innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .leftJoin(aiAgents, eq(conversations.assignedAgentId, aiAgents.id))
    .where(inArray(conversations.id, ids));

  const contactIds = rows.map((r) => r.contact.id);
  const tagRows = contactIds.length
    ? await db
        .select({ contactId: contactTags.contactId, id: tags.id, name: tags.name, color: tags.color })
        .from(contactTags)
        .innerJoin(tags, eq(contactTags.tagId, tags.id))
        .where(inArray(contactTags.contactId, contactIds))
    : [];

  return rows.map(({ conv, contact, agentId, agentName }) => ({
    id: conv.id,
    inbox_id: conv.inboxId,
    contact: {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      wa_id: contact.waId,
      stage_id: contact.stageId,
      lead_scoring: contact.leadScoring,
    },
    tags: tagRows.filter((t) => t.contactId === contact.id).map(({ id, name, color }) => ({ id, name, color })),
    last_message_at: conv.lastMessageAt?.toISOString() ?? null,
    last_message_preview: conv.lastMessagePreview,
    unread_count: conv.unreadCount,
    auto_reply: conv.autoReply,
    assigned_agent: agentId && agentName ? { id: agentId, name: agentName } : null,
    needs_human: conv.needsHuman,
    needs_human_reason: conv.needsHumanReason,
    window: windowState(conv.lastInboundAt),
  }));
}

export async function serializeConversation(id: number): Promise<ConversationSummary | null> {
  const [summary] = await serializeConversations([id]);
  return summary ?? null;
}

export async function defaultStageId(): Promise<number> {
  const [stage] = await db.select().from(stages).where(eq(stages.position, 1));
  if (!stage) throw new Error('Etapas del embudo no inicializadas (seed)');
  return stage.id;
}
