CREATE TABLE IF NOT EXISTS "training_schedule_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"training_days" jsonb NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "training_schedule_history" ADD CONSTRAINT "training_schedule_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_schedule_history_user_idx" ON "training_schedule_history" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "training_schedule_history_user_effective_from_idx" ON "training_schedule_history" USING btree ("user_id","effective_from");--> statement-breakpoint
-- Backfill: seed one history row per existing user from their CURRENT
-- trainingDays, effective since their registration date. This is a
-- best-effort guess (we have no record of earlier schedule changes) - it
-- assumes the current schedule has applied since the user started using
-- the app, which is strictly no worse than the old behavior (applying the
-- current schedule to ALL of history with no bound at all).
INSERT INTO "training_schedule_history" ("user_id", "training_days", "effective_from")
SELECT "id", "training_days", "created_at"::date
FROM "users"
ON CONFLICT ("user_id", "effective_from") DO NOTHING;