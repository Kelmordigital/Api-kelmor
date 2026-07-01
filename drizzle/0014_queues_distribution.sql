ALTER TABLE "at_queues" ADD COLUMN IF NOT EXISTS "distribution" varchar(30) DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "at_queues" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
--> statement-breakpoint
ALTER TABLE "at_bot_nodes" ADD COLUMN IF NOT EXISTS "queue_id" bigint;
