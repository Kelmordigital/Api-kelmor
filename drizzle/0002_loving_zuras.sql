CREATE TABLE "at_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticket_id" bigint NOT NULL,
	"contact_id" bigint,
	"user_id" uuid,
	"body" text,
	"from_me" boolean DEFAULT false,
	"media_type" varchar(100),
	"media_url" text,
	"ack" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "at_connections" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"serialized_id" varchar(255),
	"type" varchar(50) DEFAULT 'whatsapp',
	"status" varchar(50) DEFAULT 'disconnected',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "at_contacts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"number" varchar(50),
	"email" varchar(255),
	"origin" varchar(255),
	"lid" varchar(255),
	"profile_pic_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "at_crm_sales_reasons" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"color" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "at_historic_tickets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticket_id" bigint NOT NULL,
	"user_id" uuid,
	"status_id_init" bigint,
	"status_id_end" bigint,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "at_queues" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"color" varchar(50),
	"enabled" boolean DEFAULT true,
	"greeting_message" text
);
--> statement-breakpoint
CREATE TABLE "at_statuses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"tag" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "at_statuses_tag_unique" UNIQUE("tag")
);
--> statement-breakpoint
CREATE TABLE "at_tickets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"connection_id" bigint,
	"contact_id" bigint NOT NULL,
	"queue_id" bigint,
	"status_id" bigint DEFAULT 1 NOT NULL,
	"attendant_user_id" uuid,
	"closed_by_user_id" uuid,
	"serialized_id" varchar(255),
	"origin" varchar(255),
	"type" varchar(50) DEFAULT 'whatsapp',
	"ocurrence" varchar(500),
	"is_sale" integer,
	"sale_price" varchar(100) DEFAULT '0,00',
	"reasons_id" bigint,
	"loss_product_name" varchar(255),
	"service_not_made" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "at_messages" ADD CONSTRAINT "at_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_connections" ADD CONSTRAINT "at_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_contacts" ADD CONSTRAINT "at_contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_crm_sales_reasons" ADD CONSTRAINT "at_crm_sales_reasons_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_queues" ADD CONSTRAINT "at_queues_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_tickets" ADD CONSTRAINT "at_tickets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_tickets" ADD CONSTRAINT "at_tickets_attendant_user_id_users_id_fk" FOREIGN KEY ("attendant_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_tickets" ADD CONSTRAINT "at_tickets_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;