CREATE TABLE "at_campaign_connections" (
	"campaign_id" bigint NOT NULL,
	"connection_id" bigint NOT NULL,
	CONSTRAINT "at_campaign_connections_campaign_id_connection_id_pk" PRIMARY KEY("campaign_id","connection_id")
);
--> statement-breakpoint
CREATE TABLE "at_campaign_contacts" (
	"campaign_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	CONSTRAINT "at_campaign_contacts_campaign_id_contact_id_pk" PRIMARY KEY("campaign_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "at_campaign_sent" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" bigint NOT NULL,
	"contact_id" bigint,
	"number" varchar(50),
	"is_sent" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "at_campaigns" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"type" varchar(50) DEFAULT 'whatsapp' NOT NULL,
	"send_date" timestamp with time zone NOT NULL,
	"timezone" varchar(50) DEFAULT 'America/Sao_Paulo' NOT NULL,
	"all_contacts" boolean DEFAULT false NOT NULL,
	"tags" text,
	"is_running" boolean DEFAULT false NOT NULL,
	"is_sending" boolean DEFAULT false NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"send_contacts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "at_scheduled_message_texts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"label" varchar(200) NOT NULL,
	"text" text,
	"type" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "at_campaign_connections" ADD CONSTRAINT "at_campaign_connections_campaign_id_at_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."at_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_campaign_connections" ADD CONSTRAINT "at_campaign_connections_connection_id_at_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."at_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_campaign_contacts" ADD CONSTRAINT "at_campaign_contacts_campaign_id_at_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."at_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_campaign_contacts" ADD CONSTRAINT "at_campaign_contacts_contact_id_at_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."at_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_campaign_sent" ADD CONSTRAINT "at_campaign_sent_campaign_id_at_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."at_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_campaigns" ADD CONSTRAINT "at_campaigns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;