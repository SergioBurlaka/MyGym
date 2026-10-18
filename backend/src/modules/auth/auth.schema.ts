import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('invalid_email').toLowerCase(),
  password: z.string().min(8, 'password_too_short').max(256, 'password_too_long'),
});

export const loginSchema = z.object({
  email: z.string().email('invalid_email').toLowerCase(),
  password: z.string().min(1, 'password_required').max(256, 'password_too_long'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
