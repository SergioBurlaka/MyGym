ALTER TABLE "users" ADD COLUMN "training_time" text DEFAULT '18:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "training_duration_min" smallint DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text DEFAULT 'Europe/Kyiv' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "calendar_feed_token_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "calendar_feed_created_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_calendar_feed_token_idx" ON "users" USING btree ("calendar_feed_token_hash");