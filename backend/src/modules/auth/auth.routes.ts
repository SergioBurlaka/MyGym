import type { FastifyInstance } from 'fastify';
import { registerSchema, loginSchema } from './auth.schema.js';
import {
  registerUser,
  validateCredentials,
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  AuthError,
} from './auth.service.js';
import { env } from '../../config/env.js';

const REFRESH_COOKIE = 'mygym_refresh';

const cookieOptions = {
  path: '/api/auth',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
};

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }

    try {
      const user = await registerUser(parsed.data.email, parsed.data.password);
      const { accessToken, refreshToken } = await issueTokenPair(user);
      reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions);
      return reply.code(201).send({ accessToken, user: { id: user.id, email: user.email } });
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(409).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  fastify.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }

    try {
      const user = await validateCredentials(parsed.data.email, parsed.data.password);
      const { accessToken, refreshToken } = await issueTokenPair(user);
      reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions);
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
      return reply.code(401).send({ error: 'missing_refresh_token', message: 'Немає активної сесії' });
    }

    try {
      const { accessToken, refreshToken } = await rotateRefreshToken(rawToken);
      reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions);
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
