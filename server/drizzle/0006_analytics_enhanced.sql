ALTER TABLE "contacts" ADD COLUMN "source" text DEFAULT 'organic';--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "source_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "first_contact_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "assigned_to" bigint;--> statement-breakpoint
CREATE TABLE "daily_metrics" (
	"date" date PRIMARY KEY NOT NULL,
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
);--> statement-breakpoint
CREATE TABLE "conversion_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "conversion_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"contact_id" bigint NOT NULL,
	"from_stage_id" bigint,
	"to_stage_id" bigint NOT NULL,
	"triggered_by" text,
	"user_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_from_stage_id_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_to_stage_id_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_contacts_source" ON "contacts" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_contacts_assigned" ON "contacts" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_contact" ON "conversion_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_conversion_events_date" ON "conversion_events" USING btree ("created_at");
