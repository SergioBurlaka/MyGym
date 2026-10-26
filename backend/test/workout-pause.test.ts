import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createTestApp, registerUser, resetDb } from './helpers.js';
import { db } from '../src/db/client.js';
import { workouts } from '../src/db/schema.js';
import { autoFinishStaleWorkouts } from '../src/modules/workouts/autoFinish.js';

let app: FastifyInstance;

beforeEach(async () => {
  await resetDb();
  app = await createTestApp();
});

afterEach(async () => {
  await app.close();
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function start(auth: Record<string, string>): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: {} });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

function post(auth: Record<string, string>, id: string, action: 'pause' | 'resume' | 'finish') {
  return app.inject({ method: 'POST', url: `/api/workouts/${id}/${action}`, headers: auth });
}

async function row(id: string) {
  return (await db.query.workouts.findFirst({ where: eq(workouts.id, id) }))!;
}

describe('workout pause', () => {
  it('pauses and resumes, adding the pause to pausedMs', async () => {
    const { auth } = await registerUser(app);
    const id = await start(auth);

    const paused = await post(auth, id, 'pause');
    expect(paused.statusCode).toBe(200);
    expect(paused.json().pausedAt).not.toBeNull();

    // Pretend the pause began 10 minutes ago.
    await db.update(workouts).set({ pausedAt: minutesAgo(10) }).where(eq(workouts.id, id));
    const resumed = await post(auth, id, 'resume');
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().pausedAt).toBeNull();
    expect(Math.abs(resumed.json().pausedMs - 10 * 60_000)).toBeLessThan(5_000);
    expect(resumed.json().resumedAt).not.toBeNull();
  });

  it('is idempotent: a second pause keeps the first pause start, a second resume adds nothing', async () => {
    const { auth } = await registerUser(app);
    const id = await start(auth);
    await post(auth, id, 'pause');
    await db.update(workouts).set({ pausedAt: minutesAgo(5) }).where(eq(workouts.id, id));

    const again = await post(auth, id, 'pause');
    expect(again.statusCode).toBe(200);
    expect(Math.abs(new Date(again.json().pausedAt).getTime() - minutesAgo(5).getTime())).toBeLessThan(5_000);

    await post(auth, id, 'resume');
    const before = (await row(id)).pausedMs;
    const twice = await post(auth, id, 'resume');
    expect(twice.statusCode).toBe(200);
    expect(twice.json().pausedMs).toBe(before);
  });

  it('finishing while paused folds the open pause into pausedMs', async () => {
    const { auth } = await registerUser(app);
    const id = await start(auth);
    await post(auth, id, 'pause');
    await db.update(workouts).set({ pausedAt: minutesAgo(7) }).where(eq(workouts.id, id));

    const finished = await post(auth, id, 'finish');
    expect(finished.statusCode).toBe(200);
    expect(finished.json().timeEnd).not.toBeNull();
    expect(finished.json().pausedAt).toBeNull();
    expect(Math.abs(finished.json().pausedMs - 7 * 60_000)).toBeLessThan(5_000);
  });

  it('refuses to pause or resume a finished workout', async () => {
    const { auth } = await registerUser(app);
    const id = await start(auth);
    await post(auth, id, 'finish');

    const res = await post(auth, id, 'pause');
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('workout_finished');
    expect((await post(auth, id, 'resume')).statusCode).toBe(409);
  });

  it("can't pause another user's workout", async () => {
    const alice = await registerUser(app, 'alice@example.com');
    const bob = await registerUser(app, 'bob@example.com');
    const id = await start(alice.auth);

    expect((await post(bob.auth, id, 'pause')).statusCode).toBe(404);
    expect((await row(id)).pausedAt).toBeNull();
  });
});

describe('GET /api/workouts/active', () => {
  it('returns the open workout with its pause state, and null once finished', async () => {
    const { auth } = await registerUser(app);
    const empty = await app.inject({ method: 'GET', url: '/api/workouts/active', headers: auth });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ workout: null });

    const id = await start(auth);
    await post(auth, id, 'pause');
    const active = await app.inject({ method: 'GET', url: '/api/workouts/active', headers: auth });
    expect(active.json().workout).toMatchObject({ id, pausedMs: 0 });
    expect(active.json().workout.pausedAt).not.toBeNull();

    await post(auth, id, 'finish');
    const after = await app.inject({ method: 'GET', url: '/api/workouts/active', headers: auth });
    expect(after.json()).toEqual({ workout: null });
  });

  it("doesn't show another user's open workout", async () => {
    const alice = await registerUser(app, 'alice@example.com');
    const bob = await registerUser(app, 'bob@example.com');
    await start(alice.auth);

    const res = await app.inject({ method: 'GET', url: '/api/workouts/active', headers: bob.auth });
    expect(res.json()).toEqual({ workout: null });
  });
});

describe('auto-finish with a pause', () => {
  it('closes a workout paused and left, at the pause, without counting the pause', async () => {
    const { auth } = await registerUser(app);
    const id = await start(auth);
    await post(auth, id, 'pause');
    await db
      .update(workouts)
      .set({ timeStart: minutesAgo(130), pausedAt: minutesAgo(100) })
      .where(eq(workouts.id, id));

    expect(await autoFinishStaleWorkouts()).toBe(1);
    const w = await row(id);
    expect(w.autoFinished).toBe(true);
    expect(w.pausedAt).toBeNull();
    expect(w.pausedMs).toBe(0);
    expect(Math.abs(w.timeEnd!.getTime() - minutesAgo(100).getTime())).toBeLessThan(5_000);
  });

  it('counts a resume as activity', async () => {
    const { auth } = await registerUser(app);
    const id = await start(auth);
    // Started 3 h ago, paused for 2 h, resumed 20 min ago, nothing saved.
    await db
      .update(workouts)
      .set({ timeStart: minutesAgo(180), pausedMs: 120 * 60_000, resumedAt: minutesAgo(20) })
      .where(eq(workouts.id, id));

    expect(await autoFinishStaleWorkouts()).toBe(0);
    expect((await row(id)).timeEnd).toBeNull();
  });
});
