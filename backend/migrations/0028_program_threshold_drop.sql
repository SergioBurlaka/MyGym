-- The program-wide "try more" threshold is gone: an exercise uses its own
-- value in the program, else its category default. Not copied into the
-- exercises on purpose (user's decision 2026-10-31).
ALTER TABLE "programs" DROP CONSTRAINT "programs_try_more_check";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN IF EXISTS "try_more_after_workouts";