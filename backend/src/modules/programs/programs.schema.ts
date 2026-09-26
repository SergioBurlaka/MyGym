import { z } from 'zod';

const programExerciseInputSchema = z.object({
  exerciseId: z.string().uuid(),
  targetSets: z.coerce.number().int().min(1).max(20),
});

export const saveProgramSchema = z.object({
  name: z.string().trim().min(1, 'name_required').max(50),
  exercises: z.array(programExerciseInputSchema).min(1, 'exercises_required'),
  // Overrides the global 14-day "try_more" rule for this program's
  // exercises with a workout-count-based one. Null/omitted keeps the default.
  tryMoreAfterWorkouts: z.coerce.number().int().min(1).max(60).nullable().optional(),
});

export type SaveProgramInput = z.infer<typeof saveProgramSchema>;
