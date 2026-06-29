export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'agent';
  theme: 'light' | 'dark' | 'system';
  is_trial: boolean;
  trial_expired: boolean;
  trial_expires_at?: string | null;
}

export interface PanelUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'agent';
  is_active: boolean;
  created_at: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Stage {
  id: number;
  name: string;
  position: number;
}

export interface Inbox {
  id: number;
  name: string;
  status: 'pending' | 'connected' | 'failed' | 'disconnected';
  display_phone_number: string | null;
  waba_id: string | null;
  phone_number_id: string | null;
  last_error: string | null;
  connected_at: string | null;
  created_at: string;
  onboarding_url?: string;
}

export interface ConversationSummary {
  id: number;
  inbox_id: number;
  contact: { id: number; name: string | null; phone: string | null; wa_id: string; stage_id: number; lead_scoring: number | null };
  tags: Tag[];
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  auto_reply: 'active' | 'paused';
  assigned_agent: { id: number; name: string } | null;
  needs_human: boolean;
  needs_human_reason: string | null;
  window: { open: boolean; expiresAt: string | null };
}

export interface Message {
  id: number;
  conversation_id: number;
  wamid: string | null;
  direction: 'in' | 'out';
  author_type: 'contact' | 'user' | 'ai_agent' | 'system';
  author_name: string | null;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'template' | 'unsupported';
  body: string | null;
  media_url: string | null;
  media_mime: string | null;
  media_filename: string | null;
  template_id: number | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | null;
  failure_reason: string | null;
  channel_timestamp: string | null;
  created_at: string;
}

export interface Note {
  id: number;
  body: string;
  author: string;
  author_id: number | null;
  created_at: string;
}

export interface Template {
  id: number;
  inbox_id: number;
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  body: string;
  variables_count: number;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'disabled';
  rejection_reason: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export interface Agent {
  id: number;
  name: string;
  purpose: string;
  tone: string | null;
  instructions: string | null;
  business_info: string | null;
  escalation_rules: string | null;
  model: string;
  is_default: boolean;
  documents_count: number;
  created_at: string;
}

export interface AgentDocument {
  id: number;
  filename: string;
  mime: string;
  size_bytes: number;
  status: 'processing' | 'ready' | 'failed';
  error: string | null;
  created_at: string;
}

export interface OrModel {
  id: string;
  name: string;
  provider: string;
  isFree?: boolean;
}

export interface KanbanColumn {
  stage: Stage;
  leads: KanbanLead[];
}

export interface KanbanLead {
  contact_id: number;
  name: string;
  phone: string | null;
  stage_id: number;
  conversation_id: number | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  tags: Tag[];
  lead_scoring: number | null;
}

export interface BroadcastCampaign {
  id: number;
  inbox_id: number;
  name: string;
  template_id: number | null;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'cancelled';
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  replied_count: number;
  filter_stage_id: number | null;
  filter_tag_ids: number[];
  filter_min_score: number | null;
  filter_max_score: number | null;
  filter_last_activity_days: number | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface BroadcastRecipient {
  id: number;
  campaign_id: number;
  contact_id: number;
  conversation_id: number | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'replied';
  wamid: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface BroadcastStats {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
}

export interface AssignmentRule {
  id: number;
  name: string;
  inbox_id: number | null;
  mode: 'round_robin' | 'random' | 'least_loaded' | 'weighted' | 'manual';
  is_active: boolean;
  priority: number;
  filter_stage_id: number | null;
  filter_tag_ids: number[];
  filter_min_score: number | null;
  filter_business_hours: boolean;
  working_hours_start: number;
  working_hours_end: number;
  working_days: number[];
  agents: Array<{ user_id: number; weight: number; max_leads: number | null }>;
  created_at: string;
  updated_at: string;
}

export interface AgentWorkload {
  userId: number;
  activeLeads: number;
  name: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  type: 'call' | 'meeting' | 'follow_up' | 'demo' | 'proposal' | 'custom';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'overdue';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  contact_id: number | null;
  conversation_id: number | null;
  assigned_to: number;
  created_by: number;
  due_date: string;
  started_at: string | null;
  completed_at: string | null;
  location: string | null;
  attendees: string[];
  reminder_minutes_before: number;
  is_recurring: boolean;
  recurrence_rule: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertRule {
  id: number;
  name: string;
  type: 'stale_lead' | 'no_response' | 'stage_stuck' | 'custom';
  is_active: boolean;
  threshold_hours: number;
  filter_stage_id: number | null;
  filter_tag_ids: number[];
  filter_assigned_to: number | null;
  actions: string[];
  notify_user_ids: number[];
  message_template: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface LeadAlert {
  id: number;
  rule_id: number;
  contact_id: number;
  conversation_id: number | null;
  assigned_to: number | null;
  status: 'pending' | 'acknowledged' | 'resolved' | 'dismissed';
  message: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  contact_name: string | null;
  contact_wa_id: string;
  rule_name: string;
  rule_type: string;
}

export interface LandingPage {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  content: Record<string, unknown>;
  form_fields: Array<{ name: string; label: string; type: string; required: boolean }>;
  status: 'draft' | 'published' | 'archived';
  inbox_id: number | null;
  stage_id: number | null;
  thank_you_message: string | null;
  meta_title: string | null;
  meta_description: string | null;
  view_count: number;
  submission_count: number;
  created_by: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormSubmission {
  id: number;
  landing_page_id: number;
  contact_id: number | null;
  data: Record<string, unknown>;
  status: 'new' | 'contacted' | 'converted' | 'archived';
  notes: string | null;
  created_at: string;
  contact_name: string | null;
  contact_wa_id: string | null;
}
