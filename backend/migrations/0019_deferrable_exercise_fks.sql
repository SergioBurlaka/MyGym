ALTER TABLE "program_exercises" DROP CONSTRAINT "program_exercises_exercise_id_exercises_id_fk";
--> statement-breakpoint
ALTER TABLE "workout_exercises" DROP CONSTRAINT "workout_exercises_exercise_id_exercises_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Hand-added: drizzle-kit cannot express DEFERRABLE. Checked at commit, so
-- deleting a user (workouts/programs cascade in the same statement) works,
-- while deleting an exercise that is still referenced still fails.
ALTER TABLE "program_exercises" ALTER CONSTRAINT "program_exercises_exercise_id_exercises_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "workout_exercises" ALTER CONSTRAINT "workout_exercises_exercise_id_exercises_id_fk" DEFERRABLE INITIALLY DEFERRED;
