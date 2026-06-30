CREATE TABLE "at_research_historics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"ticket_id" bigint NOT NULL,
	"research_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	"answer_id" bigint,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "company_permissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"close_open_tickets" boolean DEFAULT false NOT NULL,
	"close_open_tickets_interval" integer DEFAULT 24 NOT NULL,
	"close_pending_tickets" boolean DEFAULT false NOT NULL,
	"close_pending_tickets_interval" integer DEFAULT 48 NOT NULL,
	"interval_between_ended_message" real DEFAULT 6 NOT NULL,
	"interval_between_init_message" real DEFAULT 1 NOT NULL,
	"interval_between_nps" real DEFAULT 24 NOT NULL,
	"research_interval" bigint DEFAULT 5 NOT NULL,
	"show_ticket_name_message" boolean DEFAULT true NOT NULL,
	"send_ticket_protocol" boolean DEFAULT false NOT NULL,
	"send_ticket_goodbye_msg" boolean DEFAULT true NOT NULL,
	"send_ticket_transfer_msg" boolean DEFAULT true NOT NULL,
	"send_group_ticket_name_message" boolean DEFAULT false NOT NULL,
	"send_group_ticket_goodbye_msg" boolean DEFAULT false NOT NULL,
	"send_group_ticket_protocol" boolean DEFAULT false NOT NULL,
	"show_all_tickets" boolean DEFAULT false NOT NULL,
	"restrict_user" boolean DEFAULT false NOT NULL,
	"limit_services_users" boolean DEFAULT false NOT NULL,
	"number_limit_services_users" integer DEFAULT 5 NOT NULL,
	"allow_close_pending_tickets" boolean DEFAULT false NOT NULL,
	"pullout_only_admins" boolean DEFAULT false NOT NULL,
	"transfer_between_connections" boolean DEFAULT true NOT NULL,
	"transfer_online_users" boolean DEFAULT false NOT NULL,
	"return_ticket" boolean DEFAULT false NOT NULL,
	"spy_ticket" boolean DEFAULT false NOT NULL,
	"view_queue_independent_history" boolean DEFAULT false NOT NULL,
	"restrict_access_user_historic_tickets" boolean DEFAULT false NOT NULL,
	"not_show_pending_ticket_without_queue" boolean DEFAULT false NOT NULL,
	"enable_automatic_tags" boolean DEFAULT false NOT NULL,
	"update_contact_name" boolean DEFAULT true NOT NULL,
	"past_ticket_messages" boolean DEFAULT false NOT NULL,
	"allow_delete_contact" boolean DEFAULT false NOT NULL,
	"download_contacts" boolean DEFAULT false NOT NULL,
	"bot_messages_visualization" boolean DEFAULT false NOT NULL,
	"hide_name_indefinitely" boolean DEFAULT false NOT NULL,
	"hide_send_no_goodbyemsg" boolean DEFAULT false NOT NULL,
	"allow_show_campaign_to_commom_user" boolean DEFAULT false NOT NULL,
	"idle_bot_ticket" boolean DEFAULT false NOT NULL,
	"internal_chat" boolean DEFAULT false NOT NULL,
	"active_kanban" boolean DEFAULT false NOT NULL,
	"group_ticket" boolean DEFAULT false NOT NULL,
	"order_tickets" boolean DEFAULT false NOT NULL,
	"api_messages" boolean DEFAULT false NOT NULL,
	"google_contacts_auto_sync" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "company_permissions_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "init_message" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "end_message" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "transfer_message" text;--> statement-breakpoint
ALTER TABLE "at_research_historics" ADD CONSTRAINT "at_research_historics_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_research_historics" ADD CONSTRAINT "at_research_historics_ticket_id_at_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."at_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_research_historics" ADD CONSTRAINT "at_research_historics_research_id_at_researchs_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."at_researchs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_research_historics" ADD CONSTRAINT "at_research_historics_answer_id_at_research_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."at_research_answers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_permissions" ADD CONSTRAINT "company_permissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;