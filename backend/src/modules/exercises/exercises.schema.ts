import { z } from 'zod';

export const equipmentValues = ['barbell', 'dumbbell', 'bodyweight'] as const;
export const categoryValues = ['large', 'small', 'bodyweight'] as const;

export const createExerciseSchema = z
  .object({
    name: z.string().trim().min(1, "Вкажіть назву вправи").max(120),
    equipment: z.enum(equipmentValues),
    category: z.enum(categoryValues),
    repRangeMin: z.coerce.number().int().min(1).max(100),
    repRangeMax: z.coerce.number().int().min(1).max(100),
    weightStepKg: z.coerce.number().min(0).max(50).default(0.5),
  })
  .refine((data) => data.repRangeMax >= data.repRangeMin, {
    message: 'Максимум повторень має бути не меншим за мінімум',
    path: ['repRangeMax'],
  });

export const updateExerciseSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    equipment: z.enum(equipmentValues).optional(),
    category: z.enum(categoryValues).optional(),
    repRangeMin: z.coerce.number().int().min(1).max(100).optional(),
    repRangeMax: z.coerce.number().int().min(1).max(100).optional(),
    weightStepKg: z.coerce.number().min(0).max(50).optional(),
  })
  .refine(
    (data) =>
      data.repRangeMin === undefined ||
      data.repRangeMax === undefined ||
      data.repRangeMax >= data.repRangeMin,
    { message: 'Максимум повторень має бути не меншим за мінімум', path: ['repRangeMax'] },
  );

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;
