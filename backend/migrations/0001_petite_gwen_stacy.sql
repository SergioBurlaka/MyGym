ALTER TABLE "workouts" ADD COLUMN "program_label" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workouts_user_label_idx" ON "workouts" USING btree ("user_id","program_label");