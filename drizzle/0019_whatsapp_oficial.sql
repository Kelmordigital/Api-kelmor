ALTER TABLE "at_connections" ADD COLUMN IF NOT EXISTS "wab_connection" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "at_connections" ADD COLUMN IF NOT EXISTS "wab_business_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "at_connections" ADD COLUMN IF NOT EXISTS "wab_business_phonenumber_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "at_connections" ADD COLUMN IF NOT EXISTS "wab_business_number" varchar(50);
--> statement-breakpoint
ALTER TABLE "at_connections" ADD COLUMN IF NOT EXISTS "wab_token" text;
--> statement-breakpoint
ALTER TABLE "at_connections" ADD COLUMN IF NOT EXISTS "wab_is_registered" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "at_messages" ADD COLUMN IF NOT EXISTS "wab_message_id" varchar(255);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "at_messages_wab_message_id_idx" ON "at_messages" ("wab_message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "at_connections_wab_phonenumber_idx" ON "at_connections" ("wab_business_phonenumber_id");
