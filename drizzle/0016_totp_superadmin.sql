ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_secret" varchar(64);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_recovery_codes" jsonb;
