CREATE TYPE "public"."limb" AS ENUM('arm', 'leg');--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "unilateral" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "limb" "limb";--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "default_bar_kg" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD COLUMN "bar_kg" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_default_bar_check" CHECK ("exercises"."default_bar_kg" IS NULL OR ("exercises"."default_bar_kg" BETWEEN 0 AND 50 AND "exercises"."equipment" = 'barbell'));--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_limb_check" CHECK ("exercises"."limb" IS NULL OR "exercises"."unilateral");--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_bar_check" CHECK ("workout_exercises"."bar_kg" BETWEEN 0 AND 50);--> statement-breakpoint
-- Backfill: every barbell exercise gets a 20 kg bar, and its logged history
-- the same bar snapshot; a barbell is always loaded on both sides, so its
-- weight_units become 2 (a "1" there was physically meaningless).
UPDATE "exercises" SET "default_bar_kg" = 20 WHERE "equipment" = 'barbell';--> statement-breakpoint
UPDATE "workout_exercises" we SET "bar_kg" = 20, "weight_units" = 2
FROM "exercises" e
WHERE we."exercise_id" = e."id" AND e."equipment" = 'barbell' AND we."weight_per_unit_kg" IS NOT NULL;
