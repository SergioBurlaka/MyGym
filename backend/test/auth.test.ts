import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, pool } from '../src/db/client.js';
import { refreshTokens, users } from '../src/db/schema.js';
import { DEFAULT_EXERCISES } from '../src/db/defaultExercises.js';
import { LOGIN_RATE_LIMIT, REGISTER_RATE_LIMIT } from '../src/modules/auth/auth.routes.js';
import { createTestApp, refreshCookie, registerUser, resetDb } from './helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  await resetDb();
  // A fresh app per test also means a fresh in-memory rate-limit store.
  app = await createTestApp();
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await pool.end();
});

describe('register', () => {
  it('creates the user, sets an httpOnly refresh cookie and seeds the default exercises', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'Serhii@Example.com', password: 'correct-horse-battery' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.user.email).toBe('serhii@example.com'); // normalised to lower case

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('mygym_refresh=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');

    const exercises = await app.inject({
      method: 'GET',
      url: '/api/exercises',
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    expect(exercises.statusCode).toBe(200);
    expect(exercises.json()).toHaveLength(DEFAULT_EXERCISES.length);
  });

  it('never stores the password or the refresh token in plain text', async () => {
    const { user, cookie } = await registerUser(app);
    const row = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(row!.passwordHash).toMatch(/^\$argon2id\$/);

    const rawToken = cookie.split('=')[1];
    const tokens = await db.query.refreshTokens.findMany({ where: eq(refreshTokens.userId, user.id) });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).not.toBe(rawToken);
  });

  it('rejects a duplicate email regardless of case', async () => {
    await registerUser(app, 'dup@example.com');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'DUP@example.com', password: 'another-password' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('email_taken');
  });

  it('validates the payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'not-an-email', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('validation_error');
  });

  it('rolls the whole sign-up back if seeding fails half-way', async () => {
    // Force the exercise seed insert to violate the category enum.
    DEFAULT_EXERCISES.push({ ...DEFAULT_EXERCISES[0], category: 'not_a_category' as never });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'half@example.com', password: 'correct-horse-battery' },
      });
      expect(res.statusCode).toBe(500);
      // The error handler must not leak the SQL/driver error to the client.
      expect(res.json()).toEqual({ error: 'internal_error', message: 'Internal server error' });
    } finally {
      DEFAULT_EXERCISES.pop();
    }

    const row = await db.query.users.findFirst({ where: eq(users.email, 'half@example.com') });
    expect(row).toBeUndefined();

    // ...so the same email can simply register again.
    await registerUser(app, 'half@example.com');
  });
});

describe('login', () => {
  it('returns an access token for valid credentials', async () => {
    await registerUser(app, 'login@example.com');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'LOGIN@example.com', password: 'correct-horse-battery' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toEqual(expect.any(String));
    expect(refreshCookie(res)).toMatch(/^mygym_refresh=/);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await registerUser(app, 'login@example.com');
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'login@example.com', password: 'wrong-password' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@example.com', password: 'wrong-password' },
    });
    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('invalid_credentials');
    }
  });

  it(`throttles after ${LOGIN_RATE_LIMIT.max} attempts per window`, async () => {
    const attempt = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'brute@example.com', password: 'guess' },
      });
    for (let i = 0; i < LOGIN_RATE_LIMIT.max; i++) {
      expect((await attempt()).statusCode).toBe(401);
    }
    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toBe('too_many_requests');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('throttles per client IP as seen by nginx, not by a spoofable header', async () => {
    const attempt = (forwardedFor: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        // The client sends its own X-Forwarded-For; nginx appends the real
        // address (here: 203.0.113.7) - only that last hop may be trusted.
        headers: { 'x-forwarded-for': `${forwardedFor}, 203.0.113.7` },
        payload: { email: 'brute@example.com', password: 'guess' },
      });
    for (let i = 0; i < LOGIN_RATE_LIMIT.max; i++) {
      await attempt(`10.0.0.${i}`);
    }
    expect((await attempt('10.0.0.250')).statusCode).toBe(429);
  });
});

describe('register throttling', () => {
  it(`allows ${REGISTER_RATE_LIMIT.max} sign-ups per window from one IP`, async () => {
    for (let i = 0; i < REGISTER_RATE_LIMIT.max; i++) {
      await registerUser(app);
    }
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'one-too-many@example.com', password: 'correct-horse-battery' },
    });
    expect(res.statusCode).toBe(429);
  });
});

describe('protected routes', () => {
  it('require a bearer token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/workouts' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('missing_token');
  });

  it('reject a forged token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/workouts',
      headers: { authorization: 'Bearer not.a.jwt' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('invalid_token');
  });
});

describe('refresh token rotation', () => {
  it('issues a new refresh token on every refresh', async () => {
    const { cookie } = await registerUser(app);
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toEqual(expect.any(String));
    expect(refreshCookie(res)).not.toBe(cookie);
  });

  it('accepts a just-rotated token within the grace window (lost response on a flaky network)', async () => {
    const { cookie } = await registerUser(app);
    const first = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie } });
    expect(first.statusCode).toBe(200);
    const retry = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie } });
    expect(retry.statusCode).toBe(200);
  });

  it('rejects a rotated token once the grace window has passed', async () => {
    const { cookie, user } = await registerUser(app);
    await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie } });
    // Pretend the rotation happened two minutes ago.
    await db
      .update(refreshTokens)
      .set({ revokedAt: sql`now() - interval '2 minutes'` })
      .where(eq(refreshTokens.userId, user.id));

    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('invalid_refresh_token');
  });

  it('rejects an expired token', async () => {
    const { cookie, user } = await registerUser(app);
    await db
      .update(refreshTokens)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(refreshTokens.userId, user.id));
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });

  it('logout kills the session immediately - no grace window', async () => {
    const { cookie } = await registerUser(app);
    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(logout.statusCode).toBe(200);
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 without a cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('missing_refresh_token');
  });
});
