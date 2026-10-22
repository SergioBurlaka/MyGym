import { z } from 'zod';

// Any IANA zone the runtime knows, including aliases a browser may report
// ("Europe/Kiev" - Intl.supportedValuesOf('timeZone') lists only canonical
// names and would reject those), normalized to the runtime's spelling. Intl
// also takes raw offsets ("+05:00") and any letter case; calendar clients
// don't understand those in a TZID, so only "Area/Location" names and UTC.
function canonicalTimeZone(tz: string): string | null {
  try {
    const canonical = new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
    return canonical === 'UTC' || canonical.includes('/') ? canonical : null;
  } catch {
    return null;
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
    timezone: z
      .string()
      .max(64)
      .transform((tz, ctx) => {
        const canonical = canonicalTimeZone(tz);
        if (!canonical) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_timezone' });
        return canonical ?? tz;
      }),
  })
  .partial()
  .refine((input) => Object.values(input).some((v) => v !== undefined), 'empty_update');

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
