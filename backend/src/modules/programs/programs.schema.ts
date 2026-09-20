import { z } from 'zod';

const programExerciseInputSchema = z.object({
  exerciseId: z.string().uuid(),
  targetSets: z.coerce.number().int().min(1).max(20),
});

export const saveProgramSchema = z.object({
  name: z.string().trim().min(1, "Назва обов'язкова").max(50),
  exercises: z.array(programExerciseInputSchema).min(1, 'Додайте хоча б одну вправу'),
});

export type SaveProgramInput = z.infer<typeof saveProgramSchema>;
