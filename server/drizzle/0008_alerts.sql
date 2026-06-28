CREATE TYPE "public"."alert_rule_type" AS ENUM('stale_lead', 'no_response', 'stage_stuck', 'custom');--> statement-breakpoint
CREATE TYPE "public"."alert_rule_action" AS ENUM('notify', 'reassign', 'tag', 'email');--> statement-breakpoint
CREATE TYPE "public"."lead_alert_status" AS ENUM('pending', 'acknowledged', 'resolved', 'dismissed');--> statement-breakpoint
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
);--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_filter_stage_id_stages_id_fk" FOREIGN KEY ("filter_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_filter_assigned_to_users_id_fk" FOREIGN KEY ("filter_assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_alert_rules_active" ON "alert_rules" USING btree ("is_active");--> statement-breakpoint
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
);--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD CONSTRAINT "lead_alerts_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD CONSTRAINT "lead_alerts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD CONSTRAINT "lead_alerts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD CONSTRAINT "lead_alerts_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD CONSTRAINT "lead_alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD CONSTRAINT "lead_alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_lead_alerts_rule" ON "lead_alerts" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "idx_lead_alerts_status" ON "lead_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_lead_alerts_contact" ON "lead_alerts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_lead_alerts_assigned" ON "lead_alerts" USING btree ("assigned_to");
