import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
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

async function exerciseId(auth: Record<string, string>): Promise<string> {
  const res = await app.inject({ method: 'GET', url: '/api/exercises', headers: auth });
  return (res.json() as { id: string }[])[0].id;
}

// Starts a workout, optionally logs one set, then moves its start and the
// set's save time into the past as if that had happened back then.
async function openWorkout(
  auth: Record<string, string>,
  opts: { startedMinutesAgo: number; savedMinutesAgo?: number },
): Promise<string> {
  const started = await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: {} });
  expect(started.statusCode).toBe(201);
  const id = started.json().id as string;
  if (opts.savedMinutesAgo != null) {
    const saved = await app.inject({
      method: 'PUT',
      url: `/api/workouts/${id}/exercises`,
      headers: auth,
      payload: {
        exercises: [
          { exerciseId: await exerciseId(auth), weightPerUnitKg: 20, weightUnits: 2, sets: [{ setNumber: 1, reps: 8 }] },
        ],
      },
    });
    expect(saved.statusCode).toBe(200);
    await db.execute(sql`
      UPDATE sets SET created_at = ${minutesAgo(opts.savedMinutesAgo).toISOString()}::timestamptz
      WHERE workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id = ${id})
    `);
  }
  await db.update(workouts).set({ timeStart: minutesAgo(opts.startedMinutesAgo) }).where(eq(workouts.id, id));
  return id;
}

async function row(id: string) {
  return (await db.query.workouts.findFirst({ where: eq(workouts.id, id) }))!;
}

describe('autoFinishStaleWorkouts', () => {
  it('closes a workout 1.5 hours after the last save, ending it at that save', async () => {
    const { auth } = await registerUser(app);
    const id = await openWorkout(auth, { startedMinutesAgo: 150, savedMinutesAgo: 95 });

    expect(await autoFinishStaleWorkouts()).toBe(1);
    const w = await row(id);
    expect(w.autoFinished).toBe(true);
    // ~95 minutes ago - the last save, not now.
    expect(Math.abs(w.timeEnd!.getTime() - minutesAgo(95).getTime())).toBeLessThan(5_000);
  });

  it('keeps a long workout open while it is still being saved', async () => {
    const { auth } = await registerUser(app);
    const id = await openWorkout(auth, { startedMinutesAgo: 150, savedMinutesAgo: 80 });

    expect(await autoFinishStaleWorkouts()).toBe(0);
    expect((await row(id)).timeEnd).toBeNull();
  });

  it('closes a workout with nothing logged 1.5 hours after its start', async () => {
    const { auth } = await registerUser(app);
    const fresh = await openWorkout(auth, { startedMinutesAgo: 80 });
    const stale = await openWorkout(auth, { startedMinutesAgo: 91 });

    expect(await autoFinishStaleWorkouts()).toBe(1);
    expect((await row(fresh)).timeEnd).toBeNull();
    const w = await row(stale);
    expect(w.autoFinished).toBe(true);
    expect(w.timeEnd!.getTime()).toBe(w.timeStart!.getTime());
  });

  it('leaves finished and CSV-imported (no start time) workouts alone', async () => {
    const { auth } = await registerUser(app);
    const finished = await openWorkout(auth, { startedMinutesAgo: 200, savedMinutesAgo: 120 });
    const res = await app.inject({ method: 'POST', url: `/api/workouts/${finished}/finish`, headers: auth });
    expect(res.statusCode).toBe(200);
    const endedAt = (await row(finished)).timeEnd;

    const imported = await openWorkout(auth, { startedMinutesAgo: 200 });
    await db.update(workouts).set({ timeStart: null }).where(eq(workouts.id, imported));

    expect(await autoFinishStaleWorkouts()).toBe(0);
    expect(await row(finished)).toMatchObject({ timeEnd: endedAt, autoFinished: false });
    expect((await row(imported)).timeEnd).toBeNull();
  });

  it('works across users and shows the flag in the API', async () => {
    const one = await registerUser(app);
    const two = await registerUser(app);
    const a = await openWorkout(one.auth, { startedMinutesAgo: 120, savedMinutesAgo: 100 });
    const b = await openWorkout(two.auth, { startedMinutesAgo: 120, savedMinutesAgo: 100 });

    expect(await autoFinishStaleWorkouts()).toBe(2);
    const got = await app.inject({ method: 'GET', url: `/api/workouts/${a}`, headers: one.auth });
    expect(got.json()).toMatchObject({ autoFinished: true });
    const list = await app.inject({ method: 'GET', url: '/api/workouts', headers: two.auth });
    expect(list.json().data.find((w: { id: string }) => w.id === b)).toMatchObject({ autoFinished: true });
  });

  it('stays closed: a later save, a second sweep or a late finish keep its end time', async () => {
    const { auth } = await registerUser(app);
    const id = await openWorkout(auth, { startedMinutesAgo: 200, savedMinutesAgo: 100 });
    expect(await autoFinishStaleWorkouts()).toBe(1);
    const endedAt = (await row(id)).timeEnd;

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/workouts/${id}/exercises`,
      headers: auth,
      payload: {
        exercises: [
          { exerciseId: await exerciseId(auth), weightPerUnitKg: 20, weightUnits: 2, sets: [{ setNumber: 1, reps: 9 }] },
        ],
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(await autoFinishStaleWorkouts()).toBe(0);
    const finished = await app.inject({ method: 'POST', url: `/api/workouts/${id}/finish`, headers: auth });
    expect(finished.statusCode).toBe(200);
    expect(await row(id)).toMatchObject({ timeEnd: endedAt, autoFinished: true });
  });
});
