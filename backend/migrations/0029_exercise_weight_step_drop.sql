ALTER TABLE "exercises" DROP CONSTRAINT "exercises_weight_step_check";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN IF EXISTS "weight_step_kg";