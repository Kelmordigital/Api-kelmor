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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "at_task_columns_board_idx" ON "at_task_columns" ("company_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "at_tasks_board_idx" ON "at_tasks" ("company_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "at_tasks_contact_idx" ON "at_tasks" ("contact_id");
