import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Некоректна email-адреса').toLowerCase(),
  password: z.string().min(8, 'Пароль має містити щонайменше 8 символів'),
});

export const loginSchema = z.object({
  email: z.string().email('Некоректна email-адреса').toLowerCase(),
  password: z.string().min(1, 'Введіть пароль'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
