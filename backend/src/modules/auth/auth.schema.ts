import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('invalid_email').toLowerCase(),
  password: z.string().min(8, 'password_too_short'),
});

export const loginSchema = z.object({
  email: z.string().email('invalid_email').toLowerCase(),
  password: z.string().min(1, 'password_required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
