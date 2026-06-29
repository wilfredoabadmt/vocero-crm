CREATE TYPE "public"."alert_rule_action" AS ENUM('notify', 'reassign', 'tag', 'email');--> statement-breakpoint
CREATE TYPE "public"."alert_rule_type" AS ENUM('stale_lead', 'no_response', 'stage_stuck', 'custom');--> statement-breakpoint
CREATE TYPE "public"."assignment_mode" AS ENUM('round_robin', 'random', 'least_loaded', 'weighted', 'manual');--> statement-breakpoint
CREATE TYPE "public"."broadcast_status" AS ENUM('draft', 'scheduled', 'sending', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."form_submission_status" AS ENUM('new', 'contacted', 'converted', 'archived');--> statement-breakpoint
CREATE TYPE "public"."landing_page_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."lead_alert_status" AS ENUM('pending', 'acknowledged', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('pending', 'sent', 'delivered', 'read', 'failed', 'replied');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'completed', 'cancelled', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('call', 'meeting', 'follow_up', 'demo', 'proposal', 'custom');--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alert_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"type" "alert_rule_type" DEFAULT 'stale_lead' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"threshold_hours" integer DEFAULT 24 NOT NULL,
	"filter_stage_id" bigint,
	"filter_tag_ids" jsonb DEFAULT '[]'::jsonb,
	"filter_assigned_to" bigint,
	"actions" jsonb DEFAULT '["notify"]'::jsonb NOT NULL,
	"notify_user_ids" jsonb DEFAULT '[]'::jsonb,
	"message_template" text,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_rule_agents" (
	"rule_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"max_leads" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_rule_agents_rule_id_user_id_pk" PRIMARY KEY("rule_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "assignment_rules" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assignment_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"inbox_id" bigint,
	"mode" "assignment_mode" DEFAULT 'round_robin' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"filter_stage_id" bigint,
	"filter_tag_ids" jsonb DEFAULT '[]'::jsonb,
	"filter_min_score" integer,
	"filter_business_hours" boolean DEFAULT false,
	"working_hours_start" integer DEFAULT 9,
	"working_hours_end" integer DEFAULT 18,
	"working_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_campaigns" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "broadcast_campaigns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"inbox_id" bigint NOT NULL,
	"name" text NOT NULL,
	"template_id" bigint,
	"status" "broadcast_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"read_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"replied_count" integer DEFAULT 0 NOT NULL,
	"filter_stage_id" bigint,
	"filter_tag_ids" jsonb DEFAULT '[]'::jsonb,
	"filter_min_score" integer,
	"filter_max_score" integer,
	"filter_last_activity_days" integer,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_recipients" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "broadcast_recipients_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"campaign_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	"conversation_id" bigint,
	"status" "recipient_status" DEFAULT 'pending' NOT NULL,
	"wamid" text,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "conversion_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"contact_id" bigint NOT NULL,
	"from_stage_id" bigint,
	"to_stage_id" bigint NOT NULL,
	"triggered_by" text,
	"user_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_metrics" (
	"date" timestamp PRIMARY KEY NOT NULL,
	"total_leads" integer DEFAULT 0 NOT NULL,
	"new_leads" integer DEFAULT 0 NOT NULL,
	"converted_leads" integer DEFAULT 0 NOT NULL,
	"total_messages" integer DEFAULT 0 NOT NULL,
	"inbound_messages" integer DEFAULT 0 NOT NULL,
	"outbound_messages" integer DEFAULT 0 NOT NULL,
	"ai_responses" integer DEFAULT 0 NOT NULL,
	"human_responses" integer DEFAULT 0 NOT NULL,
	"avg_response_time_minutes" real,
	"messages_by_source" jsonb DEFAULT '{}'::jsonb,
	"leads_by_stage" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "form_submissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"landing_page_id" bigint NOT NULL,
	"contact_id" bigint,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"referrer" text,
	"status" "form_submission_status" DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_pages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "landing_pages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"form_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "landing_page_status" DEFAULT 'draft' NOT NULL,
	"inbox_id" bigint,
	"stage_id" bigint,
	"thank_you_message" text DEFAULT '¡Gracias! Nos pondremos en contacto contigo pronto.',
	"meta_title" text,
	"meta_description" text,
	"custom_css" text,
	"custom_js" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"submission_count" integer DEFAULT 0 NOT NULL,
	"created_by" bigint NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landing_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "lead_alerts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lead_alerts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"rule_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	"conversation_id" bigint,
	"assigned_to" bigint,
	"status" "lead_alert_status" DEFAULT 'pending' NOT NULL,
	"message" text NOT NULL,
	"acknowledged_by" bigint,
	"acknowledged_at" timestamp with time zone,
	"resolved_by" bigint,
	"resolved_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_connections" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "oauth_connections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"access_token" text,
	"token_expiry" timestamp with time zone,
	"profile_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"description" text,
	"type" "task_type" DEFAULT 'follow_up' NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"contact_id" bigint,
	"conversation_id" bigint,
	"assigned_to" bigint NOT NULL,
	"created_by" bigint NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"location" text,
	"attendees" jsonb DEFAULT '[]'::jsonb,
	"reminder_minutes_before" integer DEFAULT 30,
	"is_recurring" boolean DEFAULT false,
	"recurrence_rule" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "source" text DEFAULT 'organic';--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "source_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "first_contact_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "assigned_to" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "created_by" bigint;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_filter_stage_id_stages_id_fk" FOREIGN KEY ("filter_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_filter_assigned_to_users_id_fk" FOREIGN KEY ("filter_assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rule_agents" ADD CONSTRAINT "assignment_rule_agents_rule_id_assignment_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."assignment_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rule_agents" ADD CONSTRAINT "assignment_rule_agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_inbox_id_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."inboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_filter_stage_id_stages_id_fk" FOREIGN KEY ("filter_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_campaigns" ADD CONSTRAINT "broadcast_campaigns_inbox_id_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."inboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_campaigns" ADD CONSTRAINT "broadcast_campaigns_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_campaigns" ADD CONSTRAINT "broadcast_campaigns_filter_stage_id_stages_id_fk" FOREIGN KEY ("filter_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_campaigns" ADD CONSTRAINT "broadcast_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_campaign_id_broadcast_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."broadcast_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_from_stage_id_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_to_stage_id_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_landing_page_id_landing_pages_id_fk" FOREIGN KEY ("landing_page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_inbox_id_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."inboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD CONSTRAINT "lead_alerts_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD CONSTRAINT "lead_alerts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD CONSTRAINT "lead_alerts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD CONSTRAINT "lead_alerts_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD CONSTRAINT "lead_alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD CONSTRAINT "lead_alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_connections" ADD CONSTRAINT "oauth_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_alert_rules_active" ON "alert_rules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_assignment_rules_inbox" ON "assignment_rules" USING btree ("inbox_id");--> statement-breakpoint
CREATE INDEX "idx_assignment_rules_active" ON "assignment_rules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_broadcast_recipients_campaign" ON "broadcast_recipients" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_broadcast_recipients_status" ON "broadcast_recipients" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_broadcast_recipient_per_campaign" ON "broadcast_recipients" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_contact" ON "conversion_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_date" ON "conversion_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_form_submissions_landing" ON "form_submissions" USING btree ("landing_page_id");--> statement-breakpoint
CREATE INDEX "idx_form_submissions_status" ON "form_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_landing_pages_slug" ON "landing_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_landing_pages_status" ON "landing_pages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_lead_alerts_rule" ON "lead_alerts" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "idx_lead_alerts_status" ON "lead_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_lead_alerts_contact" ON "lead_alerts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_lead_alerts_assigned" ON "lead_alerts" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_tasks_assigned" ON "tasks" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_tasks_due" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_tasks_status" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tasks_contact" ON "tasks" USING btree ("contact_id");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_source_idx" ON "contacts" USING btree ("source");--> statement-breakpoint
CREATE INDEX "contacts_assigned_idx" ON "contacts" USING btree ("assigned_to");