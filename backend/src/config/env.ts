import 'dotenv/config';
import { z } from 'zod';

// `KEY=` (empty, as in .env.example) means "not set", not an invalid value.
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be set and reasonably long'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be set and reasonably long'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Google OAuth ("Sign in with Google"). Optional: without the client id and
  // secret the Google login is simply off, so CI/tests and a server whose
  // .env isn't updated yet keep working with email + password.
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  // Must match an "Authorized redirect URI" of the OAuth client exactly.
  // Dev goes through the Vite proxy, so it's the frontend origin, not :4000.
  GOOGLE_REDIRECT_URI: z.string().url().default('http://localhost:5173/api/auth/google/callback'),
}).refine((e) => Boolean(e.GOOGLE_CLIENT_ID) === Boolean(e.GOOGLE_CLIENT_SECRET), {
  message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together',
  path: ['GOOGLE_CLIENT_SECRET'],
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
