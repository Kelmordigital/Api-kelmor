CREATE TABLE "at_cupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"type" varchar(20) DEFAULT 'percentual' NOT NULL,
	"value" numeric(10, 2),
	"gift_description" text,
	"min_sale_value" numeric(10, 2),
	"is_public" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "at_cupons_company_id_code_unique" UNIQUE("company_id","code")
);
--> statement-breakpoint
ALTER TABLE "at_cupons" ADD CONSTRAINT "at_cupons_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;