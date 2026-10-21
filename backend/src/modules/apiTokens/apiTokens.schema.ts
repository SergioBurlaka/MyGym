import { z } from 'zod';

export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1, 'name_required').max(100),
});
