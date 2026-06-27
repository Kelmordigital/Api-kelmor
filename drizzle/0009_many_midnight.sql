CREATE TABLE "at_user_connections" (
	"user_id" uuid NOT NULL,
	"connection_id" bigint NOT NULL,
	CONSTRAINT "at_user_connections_user_id_connection_id_pk" PRIMARY KEY("user_id","connection_id")
);
--> statement-breakpoint
CREATE TABLE "at_user_queues" (
	"user_id" uuid NOT NULL,
	"queue_id" bigint NOT NULL,
	CONSTRAINT "at_user_queues_user_id_queue_id_pk" PRIMARY KEY("user_id","queue_id")
);
--> statement-breakpoint
CREATE TABLE "at_queue_researchs" (
	"research_id" bigint NOT NULL,
	"queue_id" bigint NOT NULL,
	CONSTRAINT "at_queue_researchs_research_id_queue_id_pk" PRIMARY KEY("research_id","queue_id")
);
--> statement-breakpoint
CREATE TABLE "at_research_answers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"research_id" bigint NOT NULL,
	"title" varchar(200) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
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
CREATE TABLE "at_produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"short_description" text,
	"value_type" varchar(20) DEFAULT 'valor_unico' NOT NULL,
	"value" numeric(10, 2),
	"delivery_timeframe" varchar(255),
	"how_it_works" text,
	"full_description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "at_user_connections" ADD CONSTRAINT "at_user_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_user_connections" ADD CONSTRAINT "at_user_connections_connection_id_at_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."at_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_user_queues" ADD CONSTRAINT "at_user_queues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_user_queues" ADD CONSTRAINT "at_user_queues_queue_id_at_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."at_queues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_queue_researchs" ADD CONSTRAINT "at_queue_researchs_research_id_at_researchs_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."at_researchs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_queue_researchs" ADD CONSTRAINT "at_queue_researchs_queue_id_at_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."at_queues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_research_answers" ADD CONSTRAINT "at_research_answers_research_id_at_researchs_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."at_researchs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_researchs" ADD CONSTRAINT "at_researchs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_produtos" ADD CONSTRAINT "at_produtos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;