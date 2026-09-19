import { z } from 'zod';

export const startWorkoutSchema = z.object({
  // Defaults to today (server time) when omitted - lets the CSV importer
  // and "log a past workout" flow set an explicit date.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Формат дати: YYYY-MM-DD').optional(),
});

const setInputSchema = z.object({
  setNumber: z.coerce.number().int().min(1),
  reps: z.coerce.number().int().min(0).max(200),
});

const workoutExerciseInputSchema = z.object({
  exerciseId: z.string().uuid(),
  weightPerUnitKg: z.coerce.number().min(0).max(500).nullable().optional(),
  weightUnits: z.coerce.number().int().min(1).max(2).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  sets: z.array(setInputSchema).min(1, 'Додайте хоча б один підхід'),
});

export const saveWorkoutExercisesSchema = z.object({
  exercises: z.array(workoutExerciseInputSchema),
});

export type StartWorkoutInput = z.infer<typeof startWorkoutSchema>;
export type SaveWorkoutExercisesInput = z.infer<typeof saveWorkoutExercisesSchema>;
