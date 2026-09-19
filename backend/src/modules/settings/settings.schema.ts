import { z } from 'zod';

export const updateSettingsSchema = z.object({
  trainingDays: z
    .array(z.number().int().min(1).max(7))
    .max(7)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
