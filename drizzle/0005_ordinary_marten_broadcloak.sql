CREATE TABLE IF NOT EXISTS "at_connection_errors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"connection_id" bigint NOT NULL,
	"error_type" varchar(100),
	"error_code" integer,
	"error_message" text,
	"complete_error" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "at_connection_health" (
	"connection_id" bigint PRIMARY KEY NOT NULL,
	"disconnect_count_24h" integer DEFAULT 0 NOT NULL,
	"consecutive_401s" integer DEFAULT 0 NOT NULL,
	"last_401_at" timestamp,
	"last_connected_at" timestamp,
	"status" varchar(20) DEFAULT 'healthy' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "at_bot_conversations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"bot_id" bigint NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_phone" varchar(30) NOT NULL,
	"current_node_id" varchar(36),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "at_bot_nodes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"bot_id" bigint NOT NULL,
	"company_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"label" varchar(100) NOT NULL,
	"message" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"next_node_id" varchar(36),
	"delay_seconds" integer DEFAULT 2 NOT NULL,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"node_data" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "at_bots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"default_bot" boolean DEFAULT false NOT NULL,
	"response_timer" integer DEFAULT 3 NOT NULL,
	"opening_hours" boolean DEFAULT false NOT NULL,
	"offline_message" text,
	"exit_message" text,
	"send_exit_message" boolean DEFAULT false NOT NULL,
	"timezone" varchar(50) DEFAULT 'America/Sao_Paulo' NOT NULL,
	"mon_ini" varchar(5),
	"mon_fin" varchar(5),
	"tue_ini" varchar(5),
	"tue_fin" varchar(5),
	"wed_ini" varchar(5),
	"wed_fin" varchar(5),
	"thu_ini" varchar(5),
	"thu_fin" varchar(5),
	"fri_ini" varchar(5),
	"fri_fin" varchar(5),
	"sat_ini" varchar(5),
	"sat_fin" varchar(5),
	"sun_ini" varchar(5),
	"sun_fin" varchar(5),
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "at_tickets" ADD COLUMN IF NOT EXISTS "pinned" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "at_tickets" ADD COLUMN IF NOT EXISTS "is_transfer" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "at_tickets" ADD COLUMN IF NOT EXISTS "funil_stage" varchar(50) DEFAULT 'novos_leads' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "at_connection_health" ADD CONSTRAINT "at_connection_health_connection_id_at_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."at_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "at_bot_conversations" ADD CONSTRAINT "at_bot_conversations_bot_id_at_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."at_bots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "at_bot_conversations" ADD CONSTRAINT "at_bot_conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "at_bot_nodes" ADD CONSTRAINT "at_bot_nodes_bot_id_at_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."at_bots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "at_bot_nodes" ADD CONSTRAINT "at_bot_nodes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "at_bots" ADD CONSTRAINT "at_bots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
