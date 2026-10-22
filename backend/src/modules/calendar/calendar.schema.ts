import { z } from 'zod';
import { CALENDAR_TOKEN_PREFIX } from '../../utils/tokens.js';

export const feedLangSchema = z.enum(['en', 'uk']);

export const createCalendarTokenSchema = z.object({
  lang: feedLangSchema.default('en'),
});

export const feedParamsSchema = z.object({
  file: z.string().regex(new RegExp(`^${CALENDAR_TOKEN_PREFIX}[a-f0-9]{64}\\.ics$`)),
});

export const feedQuerySchema = z.object({
  lang: feedLangSchema.catch('en').default('en'),
});
