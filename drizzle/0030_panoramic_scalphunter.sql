CREATE TABLE "at_automatic_tag_rule_tags" (
	"rule_id" bigint NOT NULL,
	"etiqueta_id" uuid NOT NULL,
	CONSTRAINT "at_automatic_tag_rule_tags_rule_id_etiqueta_id_pk" PRIMARY KEY("rule_id","etiqueta_id")
);
--> statement-breakpoint
CREATE TABLE "at_automatic_tag_rules" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"keywords" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "at_automatic_tag_rule_tags" ADD CONSTRAINT "at_automatic_tag_rule_tags_rule_id_at_automatic_tag_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."at_automatic_tag_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_automatic_tag_rule_tags" ADD CONSTRAINT "at_automatic_tag_rule_tags_etiqueta_id_at_etiquetas_id_fk" FOREIGN KEY ("etiqueta_id") REFERENCES "public"."at_etiquetas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_automatic_tag_rules" ADD CONSTRAINT "at_automatic_tag_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_etiquetas" DROP COLUMN "keyword_trigger";--> statement-breakpoint
ALTER TABLE "at_etiquetas" DROP COLUMN "keyword_type";