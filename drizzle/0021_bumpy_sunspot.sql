CREATE TABLE "at_connection_queues" (
	"connection_id" bigint NOT NULL,
	"queue_id" bigint NOT NULL,
	CONSTRAINT "at_connection_queues_connection_id_queue_id_pk" PRIMARY KEY("connection_id","queue_id")
);
--> statement-breakpoint
ALTER TABLE "at_connection_queues" ADD CONSTRAINT "at_connection_queues_connection_id_at_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."at_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "at_connection_queues" ADD CONSTRAINT "at_connection_queues_queue_id_at_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."at_queues"("id") ON DELETE cascade ON UPDATE no action;