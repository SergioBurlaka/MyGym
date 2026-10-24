import { z } from 'zod';

const programExerciseInputSchema = z.object({
  exerciseId: z.string().uuid(),
  targetSets: z.coerce.number().int().min(1).max(20),
  // Per-exercise override of the program-level tryMoreAfterWorkouts below.
  tryMoreAfterWorkouts: z.coerce.number().int().min(1).max(60).nullable().optional(),
  // Where the try-more slider was dragged: the workouts-without-progress
  // counter of this exercise should read this now. Omitted = untouched.
  sessionsDone: z.coerce.number().int().min(0).max(60).optional(),
});

export const saveProgramSchema = z.object({
  name: z.string().trim().min(1, 'name_required').max(50),
  exercises: z
    .array(programExerciseInputSchema)
    .min(1, 'exercises_required')
    // program_exercises_program_exercise_idx would refuse it with a raw SQL error.
    .refine((list) => new Set(list.map((e) => e.exerciseId)).size === list.length, 'duplicate_exercise'),
  // Overrides the category-default "try_more" threshold for this program's
  // exercises (sessions without progress). Null/omitted keeps the default.
  tryMoreAfterWorkouts: z.coerce.number().int().min(1).max(60).nullable().optional(),
});

export type SaveProgramInput = z.infer<typeof saveProgramSchema>;
