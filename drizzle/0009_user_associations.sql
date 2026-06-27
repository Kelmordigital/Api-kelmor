CREATE TABLE "at_user_queues" (
	"user_id" uuid NOT NULL,
	"queue_id" bigint NOT NULL,
	CONSTRAINT "at_user_queues_pk" PRIMARY KEY("user_id","queue_id")
);
--> statement-breakpoint
CREATE TABLE "at_user_connections" (
	"user_id" uuid NOT NULL,
	"connection_id" bigint NOT NULL,
	CONSTRAINT "at_user_connections_pk" PRIMARY KEY("user_id","connection_id")
);
--> statement-breakpoint
ALTER TABLE "at_user_queues" ADD CONSTRAINT "at_user_queues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "at_user_queues" ADD CONSTRAINT "at_user_queues_queue_id_at_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."at_queues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "at_user_connections" ADD CONSTRAINT "at_user_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "at_user_connections" ADD CONSTRAINT "at_user_connections_connection_id_at_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."at_connections"("id") ON DELETE cascade ON UPDATE no action;
