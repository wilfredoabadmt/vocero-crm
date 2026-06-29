import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

export const userRole = pgEnum('user_role', ['admin', 'agent']);
export const userTheme = pgEnum('user_theme', ['light', 'dark', 'system']);
export const inboxStatus = pgEnum('inbox_status', ['pending', 'connected', 'failed', 'disconnected']);
export const messageDirection = pgEnum('message_direction', ['in', 'out']);
export const authorType = pgEnum('author_type', ['contact', 'user', 'ai_agent', 'system']);
export const messageType = pgEnum('message_type', [
  'text', 'image', 'audio', 'video', 'document', 'sticker', 'template', 'unsupported',
]);
export const messageStatus = pgEnum('message_status', ['pending', 'sent', 'delivered', 'read', 'failed']);
export const autoReplyState = pgEnum('auto_reply_state', ['active', 'paused']);
export const documentStatus = pgEnum('document_status', ['processing', 'ready', 'failed']);
export const templateCategory = pgEnum('template_category', ['MARKETING', 'UTILITY', 'AUTHENTICATION']);
export const templateStatus = pgEnum('template_status', ['draft', 'pending', 'approved', 'rejected', 'disabled']);
export const webhookSource = pgEnum('webhook_source', ['meta', 'simulation']);
export const webhookStatus = pgEnum('webhook_status', ['processed', 'discarded', 'error']);
export const broadcastStatus = pgEnum('broadcast_status', ['draft', 'scheduled', 'sending', 'completed', 'failed', 'cancelled']);
export const recipientStatus = pgEnum('recipient_status', ['pending', 'sent', 'delivered', 'read', 'failed', 'replied']);
export const assignmentMode = pgEnum('assignment_mode', ['round_robin', 'random', 'least_loaded', 'weighted', 'manual']);
export const alertRuleType = pgEnum('alert_rule_type', ['stale_lead', 'no_response', 'stage_stuck', 'custom']);
export const alertRuleAction = pgEnum('alert_rule_action', ['notify', 'reassign', 'tag', 'email']);
export const leadAlertStatus = pgEnum('lead_alert_status', ['pending', 'acknowledged', 'resolved', 'dismissed']);
export const landingPageStatus = pgEnum('landing_page_status', ['draft', 'published', 'archived']);
export const formSubmissionStatus = pgEnum('form_submission_status', ['new', 'contacted', 'converted', 'archived']);

const id = () => bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('agent'),
  isActive: boolean('is_active').notNull().default(true),
  theme: userTheme('theme').notNull().default('system'),
  isTrial: boolean('is_trial').notNull().default(false), // Flag para cuentas temporales
  trialExpiresAt: timestamp('trial_expires_at', { withTimezone: true }), // Vencimiento del trial (5 días)
  createdBy: bigint('created_by', { mode: 'number' }).references((): AnyPgColumn => users.id, { onDelete: 'set null' }), // Creador del usuario para aislamiento
  brandName: text('brand_name'), // Nombre de marca personalizado
  brandLogo: text('brand_logo'), // Ruta del logotipo personalizado
  brandAccentColor: text('brand_accent_color'), // Color de acento HEX personalizado
  createdAt: createdAt(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const oauthConnections = pgTable('oauth_connections', {
  id: id(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'facebook', 'google', etc.
  providerUserId: text('provider_user_id').notNull(),
  accessToken: text('access_token'),
  tokenExpiry: timestamp('token_expiry', { withTimezone: true }),
  profileData: jsonb('profile_data').$type<Record<string, unknown>>(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const inboxes = pgTable('inboxes', {
  id: id(),
  name: text('name').notNull(),
  status: inboxStatus('status').notNull().default('pending'),
  wabaId: text('waba_id'),
  phoneNumberId: text('phone_number_id').unique(),
  displayPhoneNumber: text('display_phone_number'),
  accessTokenEnc: text('access_token_enc'),
  lastError: text('last_error'),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const stages = pgTable('stages', {
  id: id(),
  name: text('name').notNull(),
  position: integer('position').notNull().unique(),
});

export const contacts = pgTable('contacts', {
  id: id(),
  inboxId: bigint('inbox_id', { mode: 'number' }).notNull().references(() => inboxes.id),
  waId: text('wa_id').notNull(),
  name: text('name'),
  phone: text('phone'),
  stageId: bigint('stage_id', { mode: 'number' }).notNull().references(() => stages.id),
  stageChangedAt: timestamp('stage_changed_at', { withTimezone: true }),
  leadScoring: integer('lead_scoring'),
  source: text('source').default('organic'),
  sourceMetadata: jsonb('source_metadata').$type<{
    campaign_id?: string;
    ad_set_id?: string;
    ad_id?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    referrer?: string;
    landing_page_id?: number;
    slug?: string;
  }>(),
  firstContactAt: timestamp('first_contact_at', { withTimezone: true }),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  assignedTo: bigint('assigned_to', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('contacts_inbox_wa_unique').on(t.inboxId, t.waId),
  index('contacts_source_idx').on(t.source),
  index('contacts_assigned_idx').on(t.assignedTo),
]);

export const tags = pgTable('tags', {
  id: id(),
  name: text('name').notNull().unique(),
  color: text('color').notNull().default('#64748b'),
});

export const contactTags = pgTable('contact_tags', {
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  tagId: bigint('tag_id', { mode: 'number' }).notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.contactId, t.tagId] })]);

export const aiAgents = pgTable('ai_agents', {
  id: id(),
  name: text('name').notNull(),
  purpose: text('purpose').notNull(),
  tone: text('tone'),
  instructions: text('instructions'),
  businessInfo: text('business_info'),
  escalationRules: text('escalation_rules'),
  model: text('model').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('ai_agents_single_default').on(t.isDefault).where(sql`is_default = true`)]);

export const conversations = pgTable('conversations', {
  id: id(),
  inboxId: bigint('inbox_id', { mode: 'number' }).notNull().references(() => inboxes.id),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references(() => contacts.id),
  lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  lastMessagePreview: text('last_message_preview'),
  unreadCount: integer('unread_count').notNull().default(0),
  autoReply: autoReplyState('auto_reply').notNull().default('active'),
  assignedAgentId: bigint('assigned_agent_id', { mode: 'number' }).references(() => aiAgents.id, { onDelete: 'set null' }),
  needsHuman: boolean('needs_human').notNull().default(false),
  needsHumanReason: text('needs_human_reason'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('conversations_inbox_contact_unique').on(t.inboxId, t.contactId),
  index('conversations_last_message_idx').on(t.lastMessageAt),
]);

export const templates = pgTable('templates', {
  id: id(),
  inboxId: bigint('inbox_id', { mode: 'number' }).notNull().references(() => inboxes.id),
  metaTemplateId: text('meta_template_id'),
  name: text('name').notNull(),
  language: text('language').notNull().default('es'),
  category: templateCategory('category').notNull().default('UTILITY'),
  body: text('body').notNull(),
  variablesCount: integer('variables_count').notNull().default(0),
  status: templateStatus('status').notNull().default('draft'),
  rejectionReason: text('rejection_reason'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('templates_inbox_name_lang_unique').on(t.inboxId, t.name, t.language)]);

export const messages = pgTable('messages', {
  id: id(),
  conversationId: bigint('conversation_id', { mode: 'number' }).notNull().references(() => conversations.id),
  wamid: text('wamid').unique(),
  direction: messageDirection('direction').notNull(),
  authorType: authorType('author_type').notNull(),
  authorUserId: bigint('author_user_id', { mode: 'number' }).references(() => users.id),
  authorAgentId: bigint('author_agent_id', { mode: 'number' }).references(() => aiAgents.id, { onDelete: 'set null' }),
  type: messageType('type').notNull().default('text'),
  body: text('body'),
  mediaPath: text('media_path'),
  mediaMime: text('media_mime'),
  mediaFilename: text('media_filename'),
  templateId: bigint('template_id', { mode: 'number' }).references(() => templates.id, { onDelete: 'set null' }),
  status: messageStatus('status'),
  failureReason: text('failure_reason'),
  channelTimestamp: timestamp('channel_timestamp', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('messages_conversation_idx').on(t.conversationId, t.id)]);

export const notes = pgTable('notes', {
  id: id(),
  conversationId: bigint('conversation_id', { mode: 'number' }).notNull().references(() => conversations.id),
  userId: bigint('user_id', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  createdAt: createdAt(),
});

export const agentDocuments = pgTable('agent_documents', {
  id: id(),
  agentId: bigint('agent_id', { mode: 'number' }).notNull().references(() => aiAgents.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  path: text('path').notNull(),
  status: documentStatus('status').notNull().default('processing'),
  error: text('error'),
  createdAt: createdAt(),
});

export const documentChunks = pgTable('document_chunks', {
  id: id(),
  documentId: bigint('document_id', { mode: 'number' }).notNull().references(() => agentDocuments.id, { onDelete: 'cascade' }),
  agentId: bigint('agent_id', { mode: 'number' }).notNull().references(() => aiAgents.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  tsv: tsvector('tsv'),
}, (t) => [index('document_chunks_tsv_idx').using('gin', t.tsv)]);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable('webhook_events', {
  id: id(),
  source: webhookSource('source').notNull(),
  payload: jsonb('payload'),
  status: webhookStatus('status').notNull(),
  detail: text('detail'),
  createdAt: createdAt(),
});

export const workflows = pgTable('workflows', {
  id: id(),
  name: text('name').notNull(),
  trigger: text('trigger').notNull(), // ej: 'lead_stage_changed', 'new_message'
  conditions: jsonb('conditions').notNull().default('{}'), // ej: { stageId: 2 }
  actions: jsonb('actions').notNull().default('[]'), // ej: [{ type: 'send_whatsapp_template', templateId: 1 }]
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

export const workflowLogs = pgTable('workflow_logs', {
  id: id(),
  workflowId: bigint('workflow_id', { mode: 'number' }).notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  contactId: bigint('contact_id', { mode: 'number' }).references(() => contacts.id, { onDelete: 'set null' }),
  status: text('status').notNull(), // 'success', 'failed'
  error: text('error'),
  executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const broadcastCampaigns = pgTable('broadcast_campaigns', {
  id: id(),
  inboxId: bigint('inbox_id', { mode: 'number' }).notNull().references(() => inboxes.id),
  name: text('name').notNull(),
  templateId: bigint('template_id', { mode: 'number' }).references(() => templates.id, { onDelete: 'set null' }),
  status: broadcastStatus('status').notNull().default('draft'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  totalRecipients: integer('total_recipients').notNull().default(0),
  sentCount: integer('sent_count').notNull().default(0),
  deliveredCount: integer('delivered_count').notNull().default(0),
  readCount: integer('read_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  repliedCount: integer('replied_count').notNull().default(0),
  filterStageId: bigint('filter_stage_id', { mode: 'number' }).references(() => stages.id),
  filterTagIds: jsonb('filter_tag_ids').$type<number[]>().default([]),
  filterMinScore: integer('filter_min_score'),
  filterMaxScore: integer('filter_max_score'),
  filterLastActivityDays: integer('filter_last_activity_days'),
  createdBy: bigint('created_by', { mode: 'number' }).notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const broadcastRecipients = pgTable('broadcast_recipients', {
  id: id(),
  campaignId: bigint('campaign_id', { mode: 'number' }).notNull().references(() => broadcastCampaigns.id, { onDelete: 'cascade' }),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references(() => contacts.id),
  conversationId: bigint('conversation_id', { mode: 'number' }).references(() => conversations.id),
  status: recipientStatus('status').notNull().default('pending'),
  wamid: text('wamid'),
  errorMessage: text('error_message'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  repliedAt: timestamp('replied_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index('idx_broadcast_recipients_campaign').on(t.campaignId),
  index('idx_broadcast_recipients_status').on(t.status),
  uniqueIndex('uq_broadcast_recipient_per_campaign').on(t.campaignId, t.contactId),
]);

export const assignmentRules = pgTable('assignment_rules', {
  id: id(),
  name: text('name').notNull(),
  inboxId: bigint('inbox_id', { mode: 'number' }).references(() => inboxes.id),
  mode: assignmentMode('mode').notNull().default('round_robin'),
  isActive: boolean('is_active').notNull().default(true),
  priority: integer('priority').notNull().default(0),
  filterStageId: bigint('filter_stage_id', { mode: 'number' }).references(() => stages.id),
  filterTagIds: jsonb('filter_tag_ids').$type<number[]>().default([]),
  filterMinScore: integer('filter_min_score'),
  filterBusinessHours: boolean('filter_business_hours').default(false),
  workingHoursStart: integer('working_hours_start').default(9),
  workingHoursEnd: integer('working_hours_end').default(18),
  workingDays: jsonb('working_days').$type<number[]>().default([1, 2, 3, 4, 5]),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_assignment_rules_inbox').on(t.inboxId),
  index('idx_assignment_rules_active').on(t.isActive),
]);

export const assignmentRuleAgents = pgTable('assignment_rule_agents', {
  ruleId: bigint('rule_id', { mode: 'number' }).notNull().references(() => assignmentRules.id, { onDelete: 'cascade' }),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  weight: integer('weight').notNull().default(1),
  maxLeads: integer('max_leads'),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.ruleId, t.userId] })]);

export const dailyMetrics = pgTable('daily_metrics', {
  date: timestamp('date', { mode: 'date' }).primaryKey(),
  totalLeads: integer('total_leads').notNull().default(0),
  newLeads: integer('new_leads').notNull().default(0),
  convertedLeads: integer('converted_leads').notNull().default(0),
  totalMessages: integer('total_messages').notNull().default(0),
  inboundMessages: integer('inbound_messages').notNull().default(0),
  outboundMessages: integer('outbound_messages').notNull().default(0),
  aiResponses: integer('ai_responses').notNull().default(0),
  humanResponses: integer('human_responses').notNull().default(0),
  avgResponseTimeMinutes: real('avg_response_time_minutes'),
  messagesBySource: jsonb('messages_by_source').$type<Record<string, number>>().default({}),
  leadsByStage: jsonb('leads_by_stage').$type<Record<string, number>>().default({}),
});

export const conversionEvents = pgTable('conversion_events', {
  id: id(),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references(() => contacts.id),
  fromStageId: bigint('from_stage_id', { mode: 'number' }).references(() => stages.id),
  toStageId: bigint('to_stage_id', { mode: 'number' }).notNull().references(() => stages.id),
  triggeredBy: text('triggered_by'),
  userId: bigint('user_id', { mode: 'number' }).references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  index('idx_conversion_events_contact').on(t.contactId),
  index('idx_conversion_events_date').on(t.createdAt),
]);

export const taskType = pgEnum('task_type', ['call', 'meeting', 'follow_up', 'demo', 'proposal', 'custom']);
export const taskStatus = pgEnum('task_status', ['pending', 'in_progress', 'completed', 'cancelled', 'overdue']);
export const taskPriority = pgEnum('task_priority', ['low', 'medium', 'high', 'urgent']);

export const tasks = pgTable('tasks', {
  id: id(),
  title: text('title').notNull(),
  description: text('description'),
  type: taskType('type').notNull().default('follow_up'),
  status: taskStatus('status').notNull().default('pending'),
  priority: taskPriority('priority').notNull().default('medium'),
  contactId: bigint('contact_id', { mode: 'number' }).references(() => contacts.id, { onDelete: 'set null' }),
  conversationId: bigint('conversation_id', { mode: 'number' }).references(() => conversations.id, { onDelete: 'set null' }),
  assignedTo: bigint('assigned_to', { mode: 'number' }).notNull().references(() => users.id),
  createdBy: bigint('created_by', { mode: 'number' }).notNull().references(() => users.id),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  location: text('location'),
  attendees: jsonb('attendees').$type<string[]>().default([]),
  reminderMinutesBefore: integer('reminder_minutes_before').default(30),
  isRecurring: boolean('is_recurring').default(false),
  recurrenceRule: text('recurrence_rule'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_tasks_assigned').on(t.assignedTo),
  index('idx_tasks_due').on(t.dueDate),
  index('idx_tasks_status').on(t.status),
  index('idx_tasks_contact').on(t.contactId),
]);

export const alertRules = pgTable('alert_rules', {
  id: id(),
  name: text('name').notNull(),
  type: alertRuleType('type').notNull().default('stale_lead'),
  isActive: boolean('is_active').notNull().default(true),
  thresholdHours: integer('threshold_hours').notNull().default(24),
  filterStageId: bigint('filter_stage_id', { mode: 'number' }).references(() => stages.id),
  filterTagIds: jsonb('filter_tag_ids').$type<number[]>().default([]),
  filterAssignedTo: bigint('filter_assigned_to', { mode: 'number' }).references(() => users.id),
  actions: jsonb('actions').$type<string[]>().notNull().default(['notify']),
  notifyUserIds: jsonb('notify_user_ids').$type<number[]>().default([]),
  messageTemplate: text('message_template'),
  createdBy: bigint('created_by', { mode: 'number' }).notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_alert_rules_active').on(t.isActive),
]);

export const leadAlerts = pgTable('lead_alerts', {
  id: id(),
  ruleId: bigint('rule_id', { mode: 'number' }).notNull().references(() => alertRules.id, { onDelete: 'cascade' }),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references(() => contacts.id),
  conversationId: bigint('conversation_id', { mode: 'number' }).references(() => conversations.id),
  assignedTo: bigint('assigned_to', { mode: 'number' }).references(() => users.id),
  status: leadAlertStatus('status').notNull().default('pending'),
  message: text('message').notNull(),
  acknowledgedBy: bigint('acknowledged_by', { mode: 'number' }).references(() => users.id),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  resolvedBy: bigint('resolved_by', { mode: 'number' }).references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: createdAt(),
}, (t) => [
  index('idx_lead_alerts_rule').on(t.ruleId),
  index('idx_lead_alerts_status').on(t.status),
  index('idx_lead_alerts_contact').on(t.contactId),
  index('idx_lead_alerts_assigned').on(t.assignedTo),
]);

export const landingPages = pgTable('landing_pages', {
  id: id(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  content: jsonb('content').$type<Record<string, unknown>>().notNull().default({}),
  formFields: jsonb('form_fields').$type<Array<{ name: string; label: string; type: string; required: boolean }>>().notNull().default([]),
  status: landingPageStatus('status').notNull().default('draft'),
  inboxId: bigint('inbox_id', { mode: 'number' }).references(() => inboxes.id),
  stageId: bigint('stage_id', { mode: 'number' }).references(() => stages.id),
  thankYouMessage: text('thank_you_message').default('¡Gracias! Nos pondremos en contacto contigo pronto.'),
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  customCss: text('custom_css'),
  customJs: text('custom_js'),
  viewCount: integer('view_count').notNull().default(0),
  submissionCount: integer('submission_count').notNull().default(0),
  createdBy: bigint('created_by', { mode: 'number' }).notNull().references(() => users.id),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_landing_pages_slug').on(t.slug),
  index('idx_landing_pages_status').on(t.status),
]);

export const formSubmissions = pgTable('form_submissions', {
  id: id(),
  landingPageId: bigint('landing_page_id', { mode: 'number' }).notNull().references(() => landingPages.id, { onDelete: 'cascade' }),
  contactId: bigint('contact_id', { mode: 'number' }).references(() => contacts.id),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  referrer: text('referrer'),
  status: formSubmissionStatus('status').notNull().default('new'),
  notes: text('notes'),
  createdAt: createdAt(),
}, (t) => [
  index('idx_form_submissions_landing').on(t.landingPageId),
  index('idx_form_submissions_status').on(t.status),
]);

