CREATE TABLE "at_user_avatars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"url" varchar(500) NOT NULL,
	"original_name" varchar(255),
	"mime_type" varchar(100),
	"size_bytes" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "at_user_avatars_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "at_user_avatars" ADD CONSTRAINT "at_user_avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;