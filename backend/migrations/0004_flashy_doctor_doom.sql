ALTER TABLE "workouts" ADD COLUMN "program_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workouts" ADD CONSTRAINT "workouts_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "program_exercises" DROP COLUMN IF EXISTS "weight_per_unit_kg";--> statement-breakpoint
ALTER TABLE "program_exercises" DROP COLUMN IF EXISTS "weight_units";