CREATE TABLE "at_user_achievement_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"mission_key" varchar(100) NOT NULL,
	"completed_at" timestamp DEFAULT now(),
	CONSTRAINT "at_user_achievement_progress_user_id_mission_key_unique" UNIQUE("user_id","mission_key")
);
--> statement-breakpoint
ALTER TABLE "at_user_achievement_progress" ADD CONSTRAINT "at_user_achievement_progress_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;