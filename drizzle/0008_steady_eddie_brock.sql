CREATE TABLE "at_contact_etiquetas" (
	"contact_id" uuid NOT NULL,
	"etiqueta_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "at_contact_etiquetas_contact_id_etiqueta_id_pk" PRIMARY KEY("contact_id","etiqueta_id")
);
--> statement-breakpoint
CREATE TABLE "at_etiquetas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(20) DEFAULT '#6366f1' NOT NULL,
	"icon" varchar(50) DEFAULT 'tag' NOT NULL,
	"keyword_trigger" text,
	"keyword_type" varchar(20) DEFAULT 'contains' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "at_contact_etiquetas" ADD CONSTRAINT "at_contact_etiquetas_etiqueta_id_at_etiquetas_id_fk" FOREIGN KEY ("etiqueta_id") REFERENCES "public"."at_etiquetas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_etiquetas" ADD CONSTRAINT "at_etiquetas_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;