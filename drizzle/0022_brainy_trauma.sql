CREATE TABLE "at_scheduled_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"ticket_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	"connection_id" bigint NOT NULL,
	"created_by" uuid,
	"message" text NOT NULL,
	"send_date" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "at_scheduled_messages" ADD CONSTRAINT "at_scheduled_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_scheduled_messages" ADD CONSTRAINT "at_scheduled_messages_ticket_id_at_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."at_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_scheduled_messages" ADD CONSTRAINT "at_scheduled_messages_contact_id_at_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."at_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_scheduled_messages" ADD CONSTRAINT "at_scheduled_messages_connection_id_at_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."at_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_scheduled_messages" ADD CONSTRAINT "at_scheduled_messages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;