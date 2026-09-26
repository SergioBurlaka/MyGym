import { z } from 'zod';

const programLabelSchema = z.string().trim().min(1).max(20).nullable();

export const startWorkoutSchema = z.object({
  // Defaults to today (server time) when omitted - lets the CSV importer
  // and "log a past workout" flow set an explicit date.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date_format').optional(),
  // Free-text template label ("А"/"Б"/...) to tag this workout with, chosen
  // when starting "from" a previous workout with the same label.
  programLabel: programLabelSchema.optional(),
  // When starting from a template, copy that workout's exercises+weights
  // (sets stay empty - reps are filled in fresh each session).
  copyFromWorkoutId: z.string().uuid().optional(),
  // Or start from an explicitly authored Program - takes precedence over
  // copyFromWorkoutId/programLabel when both are given.
  programId: z.string().uuid().optional(),
});

export const updateWorkoutSchema = z.object({
  programLabel: programLabelSchema.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date_format').optional(),
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
  sets: z.array(setInputSchema).min(1, 'sets_required'),
});

export const saveWorkoutExercisesSchema = z.object({
  exercises: z.array(workoutExerciseInputSchema),
});

export type StartWorkoutInput = z.infer<typeof startWorkoutSchema>;
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutSchema>;
export type SaveWorkoutExercisesInput = z.infer<typeof saveWorkoutExercisesSchema>;
