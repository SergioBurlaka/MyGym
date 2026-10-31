import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../src/db/client.js';
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

describe('id path params', () => {
  it('answer 400 for a malformed id instead of a Postgres 500', async () => {
    const { auth } = await registerUser(app);
    for (const url of [
      '/api/workouts/not-a-uuid',
      '/api/programs/123',
      '/api/progression/abc/history',
    ]) {
      const res = await app.inject({ method: 'GET', url, headers: auth });
      expect(res.statusCode, url).toBe(400);
      expect(res.json().error).toBe('invalid_id');
    }
  });

  it('answer 404 for a well-formed id that does not exist', async () => {
    const { auth } = await registerUser(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/workouts/00000000-0000-4000-8000-000000000000',
      headers: auth,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('error handler', () => {
  it('returns the standard error shape for malformed JSON', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('bad_request');
  });
});

describe('data isolation between users', () => {
  it("one user can neither read, change nor delete another user's workout", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);

    const created = await app.inject({ method: 'POST', url: '/api/workouts', headers: alice.auth, payload: {} });
    expect(created.statusCode).toBe(201);
    const workoutId = created.json().id;

    const read = await app.inject({ method: 'GET', url: `/api/workouts/${workoutId}`, headers: bob.auth });
    expect(read.statusCode).toBe(404);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/workouts/${workoutId}`,
      headers: bob.auth,
      payload: { programLabel: 'hacked' },
    });
    expect(patch.statusCode).toBe(404);

    const del = await app.inject({ method: 'DELETE', url: `/api/workouts/${workoutId}`, headers: bob.auth });
    expect(del.statusCode).toBe(404);

    const list = await app.inject({ method: 'GET', url: '/api/workouts', headers: bob.auth });
    expect(list.json().total).toBe(0);

    // ...and Alice still has it, untouched.
    const own = await app.inject({ method: 'GET', url: `/api/workouts/${workoutId}`, headers: alice.auth });
    expect(own.statusCode).toBe(200);
    expect(own.json().programLabel).toBeNull();
  });

  it("can't log sets against another user's exercise", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const aliceExercise = (await app.inject({ method: 'GET', url: '/api/exercises', headers: alice.auth })).json()[0];

    const workout = (await app.inject({ method: 'POST', url: '/api/workouts', headers: bob.auth, payload: {} })).json();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/workouts/${workout.id}/exercises`,
      headers: bob.auth,
      payload: { exercises: [{ exerciseId: aliceExercise.id, sets: [{ setNumber: 1, reps: 10 }] }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_exercises');
  });
});

describe('progression overview (end to end)', () => {
  it('suggests adding weight once the top of the rep range is hit', async () => {
    const { auth } = await registerUser(app);
    const exercises = (await app.inject({ method: 'GET', url: '/api/exercises', headers: auth })).json();
    const squat = exercises.find((e: { category: string }) => e.category === 'large');

    const workout = (await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: {} })).json();
    const saved = await app.inject({
      method: 'PUT',
      url: `/api/workouts/${workout.id}/exercises`,
      headers: auth,
      payload: {
        exercises: [
          {
            exerciseId: squat.id,
            weightPerUnitKg: 20,
            weightUnits: 2,
            sets: [
              { setNumber: 1, reps: squat.repRangeMax },
              { setNumber: 2, reps: squat.repRangeMax },
            ],
          },
        ],
      },
    });
    expect(saved.statusCode).toBe(200);

    const overview = (await app.inject({ method: 'GET', url: '/api/progression', headers: auth })).json();
    const row = overview.find((p: { exerciseId: string }) => p.exerciseId === squat.id);
    expect(row.suggestion).toBe('increase_weight');
    expect(row.lastTotalWeightKg).toBe(40);

    const untouched = overview.find((p: { exerciseId: string }) => p.exerciseId !== squat.id);
    expect(untouched.suggestion).toBe('no_data');
  });
});

describe('volume by category', () => {
  async function logWorkout(auth: Record<string, string>, date: string, exerciseId: string, payload: object) {
    const workout = (await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: { date } })).json();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/workouts/${workout.id}/exercises`,
      headers: auth,
      payload: { exercises: [{ exerciseId, ...payload }] },
    });
    expect(res.statusCode).toBe(200);
  }

  it('weeks=all returns the whole history, a number keeps its window', async () => {
    const { auth } = await registerUser(app);
    const exercises = (await app.inject({ method: 'GET', url: '/api/exercises', headers: auth })).json();
    const large = exercises.find(
      (e: { category: string; equipment: string; unilateral: boolean }) =>
        e.category === 'large' && e.equipment === 'barbell' && !e.unilateral,
    );
    const bodyweight = exercises.find((e: { category: string }) => e.category === 'bodyweight');

    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 400);
    const oldDate = old.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    // Bar 20 + 2 x 10 kg plates = 40 kg x (10 + 10) reps = 800 kg.
    await logWorkout(auth, oldDate, large.id, {
      weightPerUnitKg: 10,
      weightUnits: 2,
      barKg: 20,
      sets: [
        { setNumber: 1, reps: 10 },
        { setNumber: 2, reps: 10 },
      ],
    });
    await logWorkout(auth, today, bodyweight.id, { sets: [{ setNumber: 1, reps: 15 }] });

    const all = await app.inject({ method: 'GET', url: '/api/progression/volume-by-category?weeks=all', headers: auth });
    expect(all.statusCode).toBe(200);
    const weeks = all.json() as { weekStart: string; large: number; small: number; bodyweight: number }[];
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ large: 800, small: 0, bodyweight: 0 });
    expect(weeks[0].weekStart <= oldDate).toBe(true);
    expect(weeks[1]).toMatchObject({ large: 0, small: 0, bodyweight: 15 });

    const recent = (
      await app.inject({ method: 'GET', url: '/api/progression/volume-by-category?weeks=12', headers: auth })
    ).json();
    expect(recent).toHaveLength(1);
    expect(recent[0].bodyweight).toBe(15);
  });
});
