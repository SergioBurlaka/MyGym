ALTER TABLE "workout_exercises" ALTER COLUMN "weight_units" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exercises_user_name_idx" ON "exercises" USING btree ("user_id",lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "program_exercises_program_exercise_idx" ON "program_exercises" USING btree ("program_id","exercise_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "program_exercises_exercise_idx" ON "program_exercises" USING btree ("exercise_id");--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_kind_check" CHECK (("api_tokens"."grant_id" IS NULL) = ("api_tokens"."expires_at" IS NULL));--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_rep_range_check" CHECK ("exercises"."rep_range_min" >= 1 AND "exercises"."rep_range_max" <= 100 AND "exercises"."rep_range_min" <= "exercises"."rep_range_max");--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_weight_step_check" CHECK ("exercises"."weight_step_kg" BETWEEN 0 AND 50);--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_target_sets_check" CHECK ("program_exercises"."target_sets" BETWEEN 1 AND 20);--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_try_more_check" CHECK ("program_exercises"."try_more_after_workouts" BETWEEN 1 AND 60);--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_try_more_check" CHECK ("programs"."try_more_after_workouts" BETWEEN 1 AND 60);--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_reps_check" CHECK ("sets"."reps" BETWEEN 0 AND 200);--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_set_number_check" CHECK ("sets"."set_number" >= 1);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_training_duration_min_check" CHECK ("users"."training_duration_min" BETWEEN 15 AND 300);--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_weight_check" CHECK ("workout_exercises"."weight_per_unit_kg" BETWEEN 0 AND 500);--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_weight_units_check" CHECK (("workout_exercises"."weight_per_unit_kg" IS NULL AND "workout_exercises"."weight_units" IS NULL) OR "workout_exercises"."weight_units" IN (1, 2));