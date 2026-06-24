CREATE TABLE "at_connection_health" (
	"connection_id" bigint PRIMARY KEY NOT NULL,
	"disconnect_count_24h" integer DEFAULT 0 NOT NULL,
	"consecutive_401s" integer DEFAULT 0 NOT NULL,
	"last_401_at" timestamp,
	"last_connected_at" timestamp,
	"status" varchar(20) DEFAULT 'healthy' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "at_connection_health" ADD CONSTRAINT "at_connection_health_connection_id_at_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."at_connections"("id") ON DELETE cascade ON UPDATE no action;
