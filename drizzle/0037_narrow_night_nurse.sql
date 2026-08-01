CREATE TABLE "funil_stage_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"ticket_id" bigint NOT NULL,
	"funil_stage_id" bigint NOT NULL,
	"entered_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "funil_stage_history" ADD CONSTRAINT "funil_stage_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funil_stage_history" ADD CONSTRAINT "funil_stage_history_ticket_id_at_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."at_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funil_stage_history" ADD CONSTRAINT "funil_stage_history_funil_stage_id_funil_stages_id_fk" FOREIGN KEY ("funil_stage_id") REFERENCES "public"."funil_stages"("id") ON DELETE cascade ON UPDATE no action;