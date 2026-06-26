ALTER TABLE "at_bots" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "at_bots" ADD COLUMN "trigger_type" varchar(20) DEFAULT 'welcome' NOT NULL;--> statement-breakpoint
ALTER TABLE "at_bots" ADD COLUMN "keywords" text;--> statement-breakpoint
ALTER TABLE "at_bots" ADD COLUMN "connection_id" integer;