CREATE TABLE "agent_media" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"rule" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text DEFAULT 'image/jpeg' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_media" ADD CONSTRAINT "agent_media_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_media_org_idx" ON "agent_media" USING btree ("organization_id");