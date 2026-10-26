ALTER TABLE "workouts" ADD COLUMN "paused_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "resumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_paused_ms_check" CHECK ("workouts"."paused_ms" >= 0);--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_paused_open_check" CHECK ("workouts"."paused_at" IS NULL OR "workouts"."time_end" IS NULL);