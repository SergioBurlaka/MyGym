import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, pool } from '../src/db/client.js';
import { apiTokens } from '../src/db/schema.js';
import { MAX_ACTIVE_TOKENS } from '../src/modules/apiTokens/apiTokens.service.js';
import { createTestApp, registerUser, resetDb } from './helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  await resetDb();
  app = await createTestApp();
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await pool.end();
});

type User = Awaited<ReturnType<typeof registerUser>>;

async function createToken(user: User, name = 'Claude Code') {
  const res = await app.inject({ method: 'POST', url: '/api/tokens', headers: user.auth, payload: { name } });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; name: string; createdAt: string; token: string };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('creating and listing tokens', () => {
  it('returns the raw token once; the list and the database only ever have metadata / a hash', async () => {
    const user = await registerUser(app);
    const created = await createToken(user);

    expect(created.token).toMatch(/^mygym_pat_[0-9a-f]{64}$/);
    expect(created.name).toBe('Claude Code');

    const list = await app.inject({ method: 'GET', url: '/api/tokens', headers: user.auth });
    expect(list.json()).toEqual([
      { id: created.id, name: 'Claude Code', createdAt: created.createdAt, lastUsedAt: null },
    ]);
    expect(list.body).not.toContain(created.token);

    const [row] = await db.select().from(apiTokens);
    expect(row.tokenHash).not.toContain(created.token);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('validates the name', async () => {
    const user = await registerUser(app);
    const res = await app.inject({ method: 'POST', url: '/api/tokens', headers: user.auth, payload: { name: '   ' } });
    expect(res.statusCode).toBe(400);
  });

  it(`allows at most ${MAX_ACTIVE_TOKENS} active tokens, counting only unrevoked ones`, async () => {
    const user = await registerUser(app);
    const tokens = [];
    for (let i = 0; i < MAX_ACTIVE_TOKENS; i++) tokens.push(await createToken(user, `t${i}`));

    const over = await app.inject({ method: 'POST', url: '/api/tokens', headers: user.auth, payload: { name: 'one more' } });
    expect(over.statusCode).toBe(409);
    expect(over.json().error).toBe('too_many_tokens');

    await app.inject({ method: 'DELETE', url: `/api/tokens/${tokens[0].id}`, headers: user.auth });
    await createToken(user, 'fits again');
  });
});

describe('using a token', () => {
  it('works like a session on the rest of the API and records when it was used', async () => {
    const user = await registerUser(app);
    const { token, id } = await createToken(user);

    const workouts = await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(token) });
    expect(workouts.statusCode).toBe(200);
    const progression = await app.inject({ method: 'GET', url: '/api/progression', headers: bearer(token) });
    expect(progression.statusCode).toBe(200);

    const created = await app.inject({ method: 'POST', url: '/api/workouts', headers: bearer(token), payload: {} });
    expect(created.statusCode).toBe(201);
    // Same data the browser sees.
    const viaSession = await app.inject({ method: 'GET', url: '/api/workouts', headers: user.auth });
    expect(viaSession.json().total).toBe(1);

    const row = await db.query.apiTokens.findFirst({ where: eq(apiTokens.id, id) });
    expect(row!.lastUsedAt).toBeInstanceOf(Date);
  });

  it('writes lastUsedAt at most once a minute', async () => {
    const user = await registerUser(app);
    const { token, id } = await createToken(user);
    const recent = new Date(Date.now() - 10_000);
    await db.update(apiTokens).set({ lastUsedAt: recent }).where(eq(apiTokens.id, id));

    await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(token) });
    const row = await db.query.apiTokens.findFirst({ where: eq(apiTokens.id, id) });
    expect(row!.lastUsedAt!.getTime()).toBe(recent.getTime());
  });

  it('rejects an unknown token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(`mygym_pat_${'0'.repeat(64)}`) });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('invalid_token');
  });

  it('stops working once revoked, and drops out of the list', async () => {
    const user = await registerUser(app);
    const { token, id } = await createToken(user);

    const del = await app.inject({ method: 'DELETE', url: `/api/tokens/${id}`, headers: user.auth });
    expect(del.statusCode).toBe(200);

    const res = await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(token) });
    expect(res.statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/tokens', headers: user.auth })).json()).toEqual([]);
  });

  it('dies with its user', async () => {
    const user = await registerUser(app);
    const { token } = await createToken(user);
    await resetDb();
    const res = await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(token) });
    expect(res.statusCode).toBe(401);
  });
});

describe('isolation between users', () => {
  it("one user's token only ever sees that user's data", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const aliceToken = (await createToken(alice)).token;
    const bobToken = (await createToken(bob)).token;

    const aliceWorkout = (
      await app.inject({ method: 'POST', url: '/api/workouts', headers: bearer(aliceToken), payload: {} })
    ).json();

    const bobList = await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(bobToken) });
    expect(bobList.json().total).toBe(0);
    const bobRead = await app.inject({ method: 'GET', url: `/api/workouts/${aliceWorkout.id}`, headers: bearer(bobToken) });
    expect(bobRead.statusCode).toBe(404);

    const aliceList = await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(aliceToken) });
    expect(aliceList.json().total).toBe(1);
  });

  it("can't list or revoke another user's token", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const aliceToken = await createToken(alice);

    expect((await app.inject({ method: 'GET', url: '/api/tokens', headers: bob.auth })).json()).toEqual([]);
    const del = await app.inject({ method: 'DELETE', url: `/api/tokens/${aliceToken.id}`, headers: bob.auth });
    expect(del.statusCode).toBe(404);

    const stillWorks = await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(aliceToken.token) });
    expect(stillWorks.statusCode).toBe(200);
  });
});

describe('token management needs a browser session', () => {
  it('refuses a personal access token on /api/tokens', async () => {
    const user = await registerUser(app);
    const { token, id } = await createToken(user);

    for (const req of [
      { method: 'GET' as const, url: '/api/tokens' },
      { method: 'POST' as const, url: '/api/tokens', payload: { name: 'minted by a leaked token' } },
      { method: 'DELETE' as const, url: `/api/tokens/${id}` },
    ]) {
      const res = await app.inject({ ...req, headers: bearer(token) });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('session_required');
    }
    expect(await db.select().from(apiTokens)).toHaveLength(1);
  });
});
