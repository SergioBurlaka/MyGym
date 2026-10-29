import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, registerUser, resetDb } from './helpers.js';

// Pin down what the per-exercise queries returned before they were batched:
// starting a workout from a program, the progression overview over several
// exercises, and a program save moving several sliders at once.

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

async function exerciseIds(auth: Auth): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/api/exercises', headers: auth });
  return (res.json() as { id: string }[]).map((e) => e.id);
}

type LoggedExercise = { exerciseId: string; weightPerUnitKg?: number | null; weightUnits?: number | null; reps: number[] };

async function logWorkout(auth: Auth, date: string, entries: LoggedExercise[]) {
  const started = await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: { date } });
  expect(started.statusCode).toBe(201);
  const saved = await app.inject({
    method: 'PUT',
    url: `/api/workouts/${started.json().id}/exercises`,
    headers: auth,
    payload: {
      exercises: entries.map((e) => ({
        exerciseId: e.exerciseId,
        weightPerUnitKg: e.weightPerUnitKg ?? null,
        weightUnits: e.weightUnits ?? null,
        sets: e.reps.map((r, i) => ({ setNumber: i + 1, reps: r })),
      })),
    },
  });
  expect(saved.statusCode).toBe(200);
}

async function createProgram(auth: Auth, exercises: { exerciseId: string; targetSets: number; sessionsDone?: number }[]) {
  const res = await app.inject({ method: 'POST', url: '/api/programs', headers: auth, payload: { name: 'A', exercises } });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

type StartedExercise = {
  exerciseId: string;
  weightPerUnitKg: number | null;
  weightUnits: number | null;
  orderIndex: number;
  sets: { setNumber: number; reps: number }[];
};

async function startFromProgram(auth: Auth, programId: string): Promise<StartedExercise[]> {
  const res = await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: { programId, date: day(0) } });
  expect(res.statusCode).toBe(201);
  const workout = await app.inject({ method: 'GET', url: `/api/workouts/${res.json().id}`, headers: auth });
  return (workout.json() as { workoutExercises: StartedExercise[] }).workoutExercises;
}

const shape = (we: StartedExercise) => ({
  exerciseId: we.exerciseId,
  weightPerUnitKg: we.weightPerUnitKg,
  weightUnits: we.weightUnits,
  reps: we.sets.map((s) => [s.setNumber, s.reps]),
});

describe('start a workout from a program', () => {
  it('prefills the weight of each exercise from its own last session, in program order, with no reps', async () => {
    const { auth } = await registerUser(app);
    const [a, b, c, d] = await exerciseIds(auth);
    // a: older session, then a newer one in another workout - the newer wins.
    await logWorkout(auth, day(-6), [{ exerciseId: a, weightPerUnitKg: 10, weightUnits: 2, reps: [5, 5] }]);
    await logWorkout(auth, day(-3), [
      { exerciseId: a, weightPerUnitKg: 22.5, weightUnits: 1, reps: [10, 9, 8] },
      { exerciseId: b, reps: [15, 12] },
    ]);
    // Same date, logged later: newer by createdAt.
    await logWorkout(auth, day(-3), [{ exerciseId: b, weightPerUnitKg: 4, weightUnits: 2, reps: [11] }]);
    await logWorkout(auth, day(-1), [{ exerciseId: c, weightPerUnitKg: 30, weightUnits: 2, reps: [6, 7] }]);

    const program = await createProgram(auth, [
      { exerciseId: c, targetSets: 2 },
      { exerciseId: a, targetSets: 2 },
      { exerciseId: b, targetSets: 3 },
      { exerciseId: d, targetSets: 2 }, // never done
    ]);

    const started = await startFromProgram(auth, program.id);
    expect(started.map((we) => we.orderIndex)).toEqual([0, 1, 2, 3]);
    // Reps are typed fresh: the page shows last time's as placeholders.
    expect(started.map(shape)).toEqual([
      { exerciseId: c, weightPerUnitKg: 30, weightUnits: 2, reps: [] },
      { exerciseId: a, weightPerUnitKg: 22.5, weightUnits: 1, reps: [] },
      { exerciseId: b, weightPerUnitKg: 4, weightUnits: 2, reps: [] },
      { exerciseId: d, weightPerUnitKg: null, weightUnits: null, reps: [] },
    ]);
  });

  it('skips a later entry with no sets (copied from a template, never logged)', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    await logWorkout(auth, day(-3), [{ exerciseId: a, weightPerUnitKg: 20, weightUnits: 2, reps: [8, 7] }]);
    const workouts = await app.inject({ method: 'GET', url: '/api/workouts', headers: auth });
    const sourceId = (workouts.json() as { data: { id: string }[] }).data[0].id;
    // A template copy carries the exercise and weight, but no sets.
    const copied = await app.inject({
      method: 'POST',
      url: '/api/workouts',
      headers: auth,
      payload: { date: day(-1), copyFromWorkoutId: sourceId },
    });
    expect(copied.statusCode).toBe(201);

    const program = await createProgram(auth, [{ exerciseId: a, targetSets: 2 }]);
    expect((await startFromProgram(auth, program.id)).map(shape)).toEqual([
      { exerciseId: a, weightPerUnitKg: 20, weightUnits: 2, reps: [] },
    ]);
  });

  it("never takes another user's history", async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const [a] = await exerciseIds(owner.auth);
    const [otherA] = await exerciseIds(other.auth);
    await logWorkout(other.auth, day(-1), [{ exerciseId: otherA, weightPerUnitKg: 50, weightUnits: 2, reps: [3] }]);

    const program = await createProgram(owner.auth, [{ exerciseId: a, targetSets: 1 }]);
    expect((await startFromProgram(owner.auth, program.id)).map(shape)).toEqual([
      { exerciseId: a, weightPerUnitKg: null, weightUnits: null, reps: [] },
    ]);
  });
});

type OverviewRow = {
  exerciseId: string;
  lastWorkoutDate: string | null;
  lastTotalWeightKg: number | null;
  lastMaxReps: number | null;
  sessionsSinceProgress: number | null;
  suggestion: string;
};

async function overview(auth: Auth): Promise<OverviewRow[]> {
  const res = await app.inject({ method: 'GET', url: '/api/progression', headers: auth });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe('progression overview over several exercises', () => {
  it('judges each exercise by its own history and skips archived ones', async () => {
    const { auth } = await registerUser(app);
    const [a, b, archived] = await exerciseIds(auth);
    await logWorkout(auth, day(-4), [
      { exerciseId: a, weightPerUnitKg: 20, weightUnits: 2, reps: [8, 8] },
      { exerciseId: b, weightPerUnitKg: 5, weightUnits: 2, reps: [10] },
      { exerciseId: archived, weightPerUnitKg: 1, weightUnits: 2, reps: [1] },
    ]);
    await logWorkout(auth, day(-2), [
      { exerciseId: a, weightPerUnitKg: 20, weightUnits: 2, reps: [7, 7] },
      { exerciseId: b, weightPerUnitKg: 5, weightUnits: 2, reps: [12] },
    ]);
    await app.inject({ method: 'DELETE', url: `/api/exercises/${archived}`, headers: auth });

    const rows = await overview(auth);
    expect(rows.find((r) => r.exerciseId === archived)).toBeUndefined();
    const byId = new Map(rows.map((r) => [r.exerciseId, r]));
    expect(byId.get(a)).toMatchObject({ lastWorkoutDate: day(-2), lastTotalWeightKg: 40, lastMaxReps: 7, sessionsSinceProgress: 1 });
    expect(byId.get(b)).toMatchObject({ lastWorkoutDate: day(-2), lastTotalWeightKg: 5, lastMaxReps: 12, sessionsSinceProgress: 0 });
    // The rest of the 13 defaults have no history.
    const untouched = rows.filter((r) => r.exerciseId !== a && r.exerciseId !== b);
    expect(untouched.length).toBeGreaterThan(0);
    expect(untouched.every((r) => r.suggestion === 'no_data' && r.lastWorkoutDate === null)).toBe(true);
  });

  it('keeps the first-logged weight of a day with two workouts', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    await logWorkout(auth, day(-1), [{ exerciseId: a, weightPerUnitKg: 20, weightUnits: 2, reps: [8] }]);
    await logWorkout(auth, day(-1), [{ exerciseId: a, weightPerUnitKg: 25, weightUnits: 2, reps: [6] }]);
    const row = (await overview(auth)).find((r) => r.exerciseId === a)!;
    expect(row.lastTotalWeightKg).toBe(40);
  });
});

describe('program save moving several sliders', () => {
  it('shifts each exercise to its own position', async () => {
    const { auth } = await registerUser(app);
    const [a, b, fresh] = await exerciseIds(auth);
    for (const [offset, reps] of [
      [-6, 10],
      [-4, 9],
      [-2, 8],
    ] as const) {
      await logWorkout(auth, day(offset), [
        { exerciseId: a, weightPerUnitKg: 20, weightUnits: 2, reps: [reps] },
        { exerciseId: b, weightPerUnitKg: 5, weightUnits: 2, reps: [reps] },
      ]);
    }
    const before = new Map((await overview(auth)).map((r) => [r.exerciseId, r.sessionsSinceProgress]));
    expect(before.get(a)).toBe(2);
    expect(before.get(b)).toBe(2);

    await createProgram(auth, [
      { exerciseId: a, targetSets: 1, sessionsDone: 0 },
      { exerciseId: b, targetSets: 1, sessionsDone: 3 },
      { exerciseId: fresh, targetSets: 1, sessionsDone: 2 }, // no history: ignored
    ]);

    const after = new Map((await overview(auth)).map((r) => [r.exerciseId, r.sessionsSinceProgress]));
    expect(after.get(a)).toBe(0);
    expect(after.get(b)).toBe(3);
    expect(after.get(fresh)).toBeNull();
  });
});
