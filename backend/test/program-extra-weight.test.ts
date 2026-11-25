import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, registerUser, resetDb } from './helpers.js';

// A bodyweight exercise's added load lives in the program
// (program_exercises.extraWeightKg): a workout from the program starts with
// it, not with last time's. Barbell/dumbbell keep taking last time's weight,
// and the program ignores an added weight for them.

let app: FastifyInstance;
type Auth = Record<string, string>;

beforeEach(async () => {
  await resetDb();
  app = await createTestApp();
});

afterEach(async () => {
  await app.close();
});

function day(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function exerciseOf(auth: Auth, equipment: string): Promise<string> {
  const res = await app.inject({ method: 'GET', url: '/api/exercises', headers: auth });
  return (res.json() as { id: string; equipment: string }[]).find((e) => e.equipment === equipment)!.id;
}

async function logWorkout(auth: Auth, date: string, exerciseId: string, weightPerUnitKg: number | null, weightUnits: number | null) {
  const started = await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: { date } });
  const saved = await app.inject({
    method: 'PUT',
    url: `/api/workouts/${started.json().id}/exercises`,
    headers: auth,
    payload: { exercises: [{ exerciseId, weightPerUnitKg, weightUnits, sets: [{ setNumber: 1, reps: 10 }] }] },
  });
  expect(saved.statusCode).toBe(200);
}

type StartedExercise = { exerciseId: string; weightPerUnitKg: string | null; weightUnits: number | null };

async function startFromProgram(auth: Auth, programId: string): Promise<Map<string, StartedExercise>> {
  const res = await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: { programId, date: day(0) } });
  expect(res.statusCode).toBe(201);
  const workout = await app.inject({ method: 'GET', url: `/api/workouts/${res.json().id}`, headers: auth });
  return new Map((workout.json() as { workoutExercises: StartedExercise[] }).workoutExercises.map((we) => [we.exerciseId, we]));
}

const num = (v: string | number | null) => (v == null ? null : Number(v));

describe('program extra weight (bodyweight)', () => {
  it('is stored for bodyweight only, and dropped when 0 or omitted', async () => {
    const { auth } = await registerUser(app);
    const bw = await exerciseOf(auth, 'bodyweight');
    const db = await exerciseOf(auth, 'dumbbell');
    const res = await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: bw, targetSets: 3, extraWeightKg: 7.5 }, { exerciseId: db, targetSets: 3, extraWeightKg: 12 }] },
    });
    expect(res.statusCode).toBe(201);
    const program = res.json() as { id: string; programExercises: { exerciseId: string; extraWeightKg: string | null }[] };
    const byId = new Map(program.programExercises.map((pe) => [pe.exerciseId, num(pe.extraWeightKg)]));
    expect(byId.get(bw)).toBe(7.5);
    expect(byId.get(db)).toBeNull();

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/programs/${program.id}`,
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: bw, targetSets: 3, extraWeightKg: 0 }] },
    });
    expect(updated.statusCode).toBe(200);
    expect(num(updated.json().programExercises[0].extraWeightKg)).toBeNull();
  });

  it('rejects a weight out of range', async () => {
    const { auth } = await registerUser(app);
    const bw = await exerciseOf(auth, 'bodyweight');
    const res = await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: bw, targetSets: 3, extraWeightKg: 501 }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("starts a bodyweight exercise with the program's weight, not last time's; others keep last time's", async () => {
    const { auth } = await registerUser(app);
    const bw = await exerciseOf(auth, 'bodyweight');
    const dumbbell = await exerciseOf(auth, 'dumbbell');
    await logWorkout(auth, day(-2), bw, 20, 2);
    await logWorkout(auth, day(-2), dumbbell, 14, 2);

    const create = (extraWeightKg: number | null) =>
      app.inject({
        method: 'POST',
        url: '/api/programs',
        headers: auth,
        payload: {
          name: `P${extraWeightKg}`,
          exercises: [{ exerciseId: bw, targetSets: 3, extraWeightKg }, { exerciseId: dumbbell, targetSets: 3 }],
        },
      });

    const withWeight = (await create(10)).json() as { id: string };
    let started = await startFromProgram(auth, withWeight.id);
    expect(num(started.get(bw)!.weightPerUnitKg)).toBe(10);
    expect(started.get(bw)!.weightUnits).not.toBeNull();
    expect(num(started.get(dumbbell)!.weightPerUnitKg)).toBe(14);

    // None in the program = none in the workout, even though last time had 20.
    const without = (await create(null)).json() as { id: string };
    started = await startFromProgram(auth, without.id);
    expect(started.get(bw)!.weightPerUnitKg).toBeNull();
    expect(started.get(bw)!.weightUnits).toBeNull();
    expect(num(started.get(dumbbell)!.weightPerUnitKg)).toBe(14);
  });
});
