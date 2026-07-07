ALTER TABLE "at_bot_conversations" ADD COLUMN IF NOT EXISTS "context" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "at_bot_rotate_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"bot_id" bigint NOT NULL,
	"node_id" varchar(36) NOT NULL,
	"contact_name" varchar(255),
	"contact_phone" varchar(30) NOT NULL,
	"lead_phone" varchar(30),
	"lead_name" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "at_bot_rotate_log" ADD CONSTRAINT "at_bot_rotate_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "at_bot_rotate_log" ADD CONSTRAINT "at_bot_rotate_log_bot_id_at_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."at_bots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "at_bot_rotate_log_node_idx" ON "at_bot_rotate_log" ("node_id");
--> statement-breakpoint
ALTER TABLE "at_contact_etiquetas" ALTER COLUMN "contact_id" TYPE varchar(64) USING "contact_id"::text;
