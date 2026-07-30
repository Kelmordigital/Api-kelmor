CREATE TABLE "crm_contact_notes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_id" bigint NOT NULL,
	"user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "crm_contact_notes" ADD CONSTRAINT "crm_contact_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_notes" ADD CONSTRAINT "crm_contact_notes_contact_id_at_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."at_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_notes" ADD CONSTRAINT "crm_contact_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;