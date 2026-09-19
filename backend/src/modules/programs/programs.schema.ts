import { z } from 'zod';

const programExerciseInputSchema = z.object({
  exerciseId: z.string().uuid(),
  weightPerUnitKg: z.coerce.number().min(0).max(500).nullable().optional(),
  weightUnits: z.coerce.number().int().min(1).max(2).nullable().optional(),
});

export const saveProgramSchema = z.object({
  name: z.string().trim().min(1, "Назва обов'язкова").max(50),
  exercises: z.array(programExerciseInputSchema).min(1, 'Додайте хоча б одну вправу'),
});

export type SaveProgramInput = z.infer<typeof saveProgramSchema>;
