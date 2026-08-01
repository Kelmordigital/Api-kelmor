CREATE TABLE "funil_stages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(50) DEFAULT 'bg-blue-500' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_waiting_stage" boolean DEFAULT false NOT NULL,
	"is_finished_stage" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "at_tickets" ADD COLUMN "funil_stage_id" bigint;--> statement-breakpoint
ALTER TABLE "funil_stages" ADD CONSTRAINT "funil_stages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_tickets" ADD CONSTRAINT "at_tickets_funil_stage_id_funil_stages_id_fk" FOREIGN KEY ("funil_stage_id") REFERENCES "public"."funil_stages"("id") ON DELETE set null ON UPDATE no action;