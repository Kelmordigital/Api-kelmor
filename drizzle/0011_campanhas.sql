CREATE TABLE "at_campaigns" (
	"id" bigserial PRIMARY KEY,
	"company_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"type" varchar(50) NOT NULL DEFAULT 'whatsapp',
	"send_date" timestamptz NOT NULL,
	"timezone" varchar(50) NOT NULL DEFAULT 'America/Sao_Paulo',
	"all_contacts" boolean NOT NULL DEFAULT false,
	"tags" text,
	"is_running" boolean NOT NULL DEFAULT false,
	"is_sending" boolean NOT NULL DEFAULT false,
	"is_paused" boolean NOT NULL DEFAULT false,
	"send_contacts" integer NOT NULL DEFAULT 0,
	"created_at" timestamptz DEFAULT now(),
	"updated_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "at_campaign_connections" (
	"campaign_id" bigint NOT NULL,
	"connection_id" bigint NOT NULL,
	CONSTRAINT "at_campaign_connections_pk" PRIMARY KEY("campaign_id","connection_id")
);
--> statement-breakpoint
CREATE TABLE "at_campaign_contacts" (
	"campaign_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	CONSTRAINT "at_campaign_contacts_pk" PRIMARY KEY("campaign_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "at_campaign_sent" (
	"id" bigserial PRIMARY KEY,
	"campaign_id" bigint NOT NULL,
	"contact_id" bigint,
	"number" varchar(50),
	"is_sent" boolean NOT NULL DEFAULT false,
	"sent_at" timestamptz,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "at_scheduled_message_texts" (
	"id" bigserial PRIMARY KEY,
	"company_id" uuid NOT NULL,
	"label" varchar(200) NOT NULL,
	"text" text,
	"type" integer NOT NULL DEFAULT 1,
	CONSTRAINT "at_scheduled_message_texts_company_type_uq" UNIQUE ("company_id", "type")
);
--> statement-breakpoint
ALTER TABLE "at_campaigns" ADD CONSTRAINT "at_campaigns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "at_campaign_connections" ADD CONSTRAINT "at_campaign_connections_campaign_id_at_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."at_campaigns"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "at_campaign_connections" ADD CONSTRAINT "at_campaign_connections_connection_id_at_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."at_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "at_campaign_contacts" ADD CONSTRAINT "at_campaign_contacts_campaign_id_at_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."at_campaigns"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "at_campaign_contacts" ADD CONSTRAINT "at_campaign_contacts_contact_id_at_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."at_contacts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "at_campaign_sent" ADD CONSTRAINT "at_campaign_sent_campaign_id_at_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."at_campaigns"("id") ON DELETE cascade ON UPDATE no action;