CREATE TABLE "at_crm_keywords" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"keyword" varchar(255) NOT NULL,
	"origin" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
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
CREATE TABLE IF NOT EXISTS "at_task_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(100) NOT NULL,
	"kind" varchar(20) DEFAULT 'custom' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "at_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"contact_id" bigint,
	"titulo" varchar(255) NOT NULL,
	"descricao" text,
	"due_date" timestamp,
	"position" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "at_contact_etiquetas" ALTER COLUMN "contact_id" SET DATA TYPE varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_secret" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_recovery_codes" jsonb;--> statement-breakpoint
ALTER TABLE "at_messages" ADD COLUMN IF NOT EXISTS "wab_message_id" varchar(255);--> statement-breakpoint
ALTER TABLE "at_connections" ADD COLUMN IF NOT EXISTS "wab_connection" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "at_connections" ADD COLUMN IF NOT EXISTS "wab_business_id" varchar(255);--> statement-breakpoint
ALTER TABLE "at_connections" ADD COLUMN IF NOT EXISTS "wab_business_phonenumber_id" varchar(255);--> statement-breakpoint
ALTER TABLE "at_connections" ADD COLUMN IF NOT EXISTS "wab_business_number" varchar(50);--> statement-breakpoint
ALTER TABLE "at_connections" ADD COLUMN IF NOT EXISTS "wab_token" text;--> statement-breakpoint
ALTER TABLE "at_connections" ADD COLUMN IF NOT EXISTS "wab_is_registered" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "at_contacts" ADD COLUMN IF NOT EXISTS "wa_username" varchar(255);--> statement-breakpoint
ALTER TABLE "at_queues" ADD COLUMN IF NOT EXISTS "distribution" varchar(30) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "at_queues" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "at_bot_conversations" ADD COLUMN IF NOT EXISTS "context" text;--> statement-breakpoint
ALTER TABLE "at_bot_nodes" ADD COLUMN IF NOT EXISTS "queue_id" bigint;--> statement-breakpoint
ALTER TABLE "company_permissions" ADD COLUMN "idle_bot_ticket_queue_id" bigint;--> statement-breakpoint
ALTER TABLE "company_permissions" ADD COLUMN "create_ticket_api_msg" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "company_permissions" ADD COLUMN "allow_show_name_on_chat" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "company_permissions" ADD COLUMN "notify_by_email_connection" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "company_permissions" ADD COLUMN "active_crm" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "at_crm_keywords" ADD CONSTRAINT "at_crm_keywords_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
DO $$ BEGIN
 ALTER TABLE "at_task_columns" ADD CONSTRAINT "at_task_columns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "at_tasks" ADD CONSTRAINT "at_tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "at_tasks" ADD CONSTRAINT "at_tasks_column_id_at_task_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."at_task_columns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "at_tasks" ADD CONSTRAINT "at_tasks_contact_id_at_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."at_contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;