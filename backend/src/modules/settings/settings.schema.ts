import { z } from 'zod';

// Accepts any zone the runtime knows, including aliases a browser may report
// (e.g. "Europe/Kiev") - Intl.supportedValuesOf('timeZone') lists only
// canonical names and would reject those.
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// PATCH semantics: only the fields present in the body change.
export const updateSettingsSchema = z
  .object({
    trainingDays: z
      .array(z.number().int().min(1).max(7))
      .max(7)
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
    trainingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalid_time'),
    trainingDurationMin: z.number().int().min(15).max(300),
    timezone: z.string().max(64).refine(isValidTimeZone, 'invalid_timezone'),
  })
  .partial()
  .refine((input) => Object.values(input).some((v) => v !== undefined), 'empty_update');

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
