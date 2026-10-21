import type { FastifyInstance, FastifyRequest } from 'fastify';
import { registerSchema, loginSchema } from './auth.schema.js';
import {
  registerUser,
  validateCredentials,
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  AuthError,
} from './auth.service.js';
import { refreshTtlToDate } from '../../utils/tokens.js';

const REFRESH_COOKIE = 'mygym_refresh';

// Per-IP throttling for the two endpoints that verify a password (argon2 is
// deliberately slow, so these are also the cheapest way to load the CPU).
// 10 logins/min is far above what a human mistyping needs, far below what
// a password-guessing script wants.
export const LOGIN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };
export const REGISTER_RATE_LIMIT = { max: 5, timeWindow: '15 minutes' };

// Persistent (maxAge) rather than a session cookie: mobile browsers drop
// session cookies when they kill a backgrounded tab mid-workout. `secure`
// follows the actual scheme (X-Forwarded-Proto from nginx) - browsers silently
// discard Secure cookies set over HTTP, which broke refresh entirely back when
// prod nginx was plain HTTP; dev still is.
function cookieOptions(request: FastifyRequest) {
  return {
    path: '/api/auth',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: request.protocol === 'https',
    maxAge: Math.floor((refreshTtlToDate().getTime() - Date.now()) / 1000),
  };
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', { config: { rateLimit: REGISTER_RATE_LIMIT } }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }

    try {
      const user = await registerUser(parsed.data.email, parsed.data.password);
      const { accessToken, refreshToken } = await issueTokenPair(user);
      reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions(request));
      return reply.code(201).send({ accessToken, user: { id: user.id, email: user.email } });
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(409).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  fastify.post('/login', { config: { rateLimit: LOGIN_RATE_LIMIT } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }

    try {
      const user = await validateCredentials(parsed.data.email, parsed.data.password);
      const { accessToken, refreshToken } = await issueTokenPair(user);
      reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions(request));
      return reply.send({ accessToken, user: { id: user.id, email: user.email } });
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(401).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  fastify.post('/refresh', async (request, reply) => {
    const rawToken = request.cookies?.[REFRESH_COOKIE];
    if (!rawToken) {
      return reply.code(401).send({ error: 'missing_refresh_token', message: 'No active session' });
    }

    try {
      const { accessToken, refreshToken } = await rotateRefreshToken(rawToken);
      reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions(request));
      return reply.send({ accessToken });
    } catch (err) {
      if (err instanceof AuthError) {
        reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
        return reply.code(401).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  fastify.post('/logout', async (request, reply) => {
    const rawToken = request.cookies?.[REFRESH_COOKIE];
    if (rawToken) {
      await revokeRefreshToken(rawToken);
    }
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return reply.send({ ok: true });
  });
}
