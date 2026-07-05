DELETE FROM "users" a
USING "users" b
WHERE a."profile_id" = 3 AND b."profile_id" = 3
  AND (a."created_at" > b."created_at" OR (a."created_at" = b."created_at" AND a."id" > b."id"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "only_one_superadmin" ON "users" ("profile_id") WHERE "profile_id" = 3;
