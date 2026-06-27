CREATE TABLE "at_researchs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" varchar(50) DEFAULT 'satisfaction' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"default_research" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "at_research_answers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"research_id" bigint NOT NULL,
	"title" varchar(200) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "at_queue_researchs" (
	"research_id" bigint NOT NULL,
	"queue_id" bigint NOT NULL,
	CONSTRAINT "at_queue_researchs_pk" PRIMARY KEY("research_id","queue_id")
);
--> statement-breakpoint
ALTER TABLE "at_researchs" ADD CONSTRAINT "at_researchs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "at_research_answers" ADD CONSTRAINT "at_research_answers_research_id_at_researchs_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."at_researchs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "at_queue_researchs" ADD CONSTRAINT "at_queue_researchs_research_id_at_researchs_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."at_researchs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "at_queue_researchs" ADD CONSTRAINT "at_queue_researchs_queue_id_at_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."at_queues"("id") ON DELETE cascade ON UPDATE no action;
