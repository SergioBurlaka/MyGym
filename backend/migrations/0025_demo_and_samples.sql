ALTER TABLE "users" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "demo_reset_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_demo_idx" ON "users" USING btree ("is_demo") WHERE "users"."is_demo";