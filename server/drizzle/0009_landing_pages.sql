CREATE TYPE "public"."landing_page_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."form_submission_status" AS ENUM('new', 'contacted', 'converted', 'archived');--> statement-breakpoint
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_slug_unique" UNIQUE ("slug");--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_inbox_id_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."inboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_landing_pages_slug" ON "landing_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_landing_pages_status" ON "landing_pages" USING btree ("status");--> statement-breakpoint
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
);--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_landing_page_id_landing_pages_id_fk" FOREIGN KEY ("landing_page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_form_submissions_landing" ON "form_submissions" USING btree ("landing_page_id");--> statement-breakpoint
CREATE INDEX "idx_form_submissions_status" ON "form_submissions" USING btree ("status");
