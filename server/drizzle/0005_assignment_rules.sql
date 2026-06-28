CREATE TYPE "public"."assignment_mode" AS ENUM('round_robin', 'random', 'least_loaded', 'weighted', 'manual');--> statement-breakpoint
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
);--> statement-breakpoint
CREATE TABLE "assignment_rule_agents" (
	"rule_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"max_leads" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_rule_agents_rule_id_user_id_pk" PRIMARY KEY("rule_id","user_id")
);--> statement-breakpoint
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_inbox_id_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."inboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_filter_stage_id_stages_id_fk" FOREIGN KEY ("filter_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rule_agents" ADD CONSTRAINT "assignment_rule_agents_rule_id_assignment_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."assignment_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rule_agents" ADD CONSTRAINT "assignment_rule_agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assignment_rules_inbox" ON "assignment_rules" USING btree ("inbox_id");--> statement-breakpoint
CREATE INDEX "idx_assignment_rules_active" ON "assignment_rules" USING btree ("is_active");
