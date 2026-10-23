import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, registerUser, resetDb } from './helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  await resetDb();
  app = await createTestApp();
});

afterEach(async () => {
  await app.close();
});

async function exerciseIds(auth: Record<string, string>): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/api/exercises', headers: auth });
  return (res.json() as { id: string }[]).map((e) => e.id);
}

async function overviewThreshold(auth: Record<string, string>, exerciseId: string) {
  const res = await app.inject({ method: 'GET', url: '/api/progression', headers: auth });
  expect(res.statusCode).toBe(200);
  const row = (res.json() as { exerciseId: string; tryMoreAfterWorkouts: number | null }[]).find(
    (p) => p.exerciseId === exerciseId,
  );
  return row?.tryMoreAfterWorkouts;
}

describe('per-exercise try-more threshold', () => {
  it('saves it and returns it with the program', async () => {
    const { auth } = await registerUser(app);
    const [a, b] = await exerciseIds(auth);
    const res = await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: {
        name: 'A',
        exercises: [
          { exerciseId: a, targetSets: 3, tryMoreAfterWorkouts: 6 },
          { exerciseId: b, targetSets: 3 },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const program = res.json() as { id: string; programExercises: { exerciseId: string; tryMoreAfterWorkouts: number | null }[] };
    expect(program.programExercises.map((pe) => pe.tryMoreAfterWorkouts)).toEqual([6, null]);

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/programs/${program.id}`,
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 3, tryMoreAfterWorkouts: 4 }] },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().programExercises[0].tryMoreAfterWorkouts).toBe(4);
  });

  it('rejects an out-of-range value', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    const res = await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 3, tryMoreAfterWorkouts: 0 }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("overrides the program's value, falls back to it, and takes the smallest across programs", async () => {
    const { auth } = await registerUser(app);
    const [a, b, c] = await exerciseIds(auth);
    await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: {
        name: 'A',
        tryMoreAfterWorkouts: 8,
        exercises: [
          { exerciseId: a, targetSets: 3, tryMoreAfterWorkouts: 5 },
          { exerciseId: b, targetSets: 3 },
        ],
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'B', exercises: [{ exerciseId: b, targetSets: 3, tryMoreAfterWorkouts: 3 }] },
    });

    expect(await overviewThreshold(auth, a)).toBe(5); // own value beats the program's 8
    expect(await overviewThreshold(auth, b)).toBe(3); // 8 (A, inherited) vs 3 (B)
    expect(await overviewThreshold(auth, c)).toBeNull(); // in no program
  });
});

describe('try-more slider (sessionsDone)', () => {
  async function logSession(auth: Record<string, string>, exerciseId: string, date: string, reps: number[]) {
    const started = await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: { date } });
    expect(started.statusCode).toBe(201);
    const saved = await app.inject({
      method: 'PUT',
      url: `/api/workouts/${started.json().id}/exercises`,
      headers: auth,
      payload: {
        exercises: [
          { exerciseId, weightPerUnitKg: 20, weightUnits: 2, sets: reps.map((r, i) => ({ setNumber: i + 1, reps: r })) },
        ],
      },
    });
    expect(saved.statusCode).toBe(200);
  }

  async function counter(auth: Record<string, string>, exerciseId: string) {
    const res = await app.inject({ method: 'GET', url: '/api/progression', headers: auth });
    return (res.json() as { exerciseId: string; sessionsSinceProgress: number | null; suggestion: string }[]).find(
      (p) => p.exerciseId === exerciseId,
    )!;
  }

  it('moves the counter both ways until the next real progress', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    const created = await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 2, tryMoreAfterWorkouts: 3 }] },
    });
    const programId = created.json().id as string;
    const save = (sessionsDone: number) =>
      app.inject({
        method: 'PUT',
        url: `/api/programs/${programId}`,
        headers: auth,
        payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 2, tryMoreAfterWorkouts: 3, sessionsDone }] },
      });

    for (const date of ['2026-10-01', '2026-10-03', '2026-10-05']) await logSession(auth, a, date, [8, 8]);
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 2 });

    expect((await save(0)).statusCode).toBe(200); // postpone
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 0, suggestion: 'ok' });

    await logSession(auth, a, '2026-10-07', [8, 8]);
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 1 });

    expect((await save(3)).statusCode).toBe(200); // bring forward
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 3, suggestion: 'try_more' });

    // Real progress restarts the count and the shift lapses.
    await logSession(auth, a, '2026-10-09', [8, 8, 8]);
    await logSession(auth, a, '2026-10-11', [8, 8, 8]);
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 1, suggestion: 'ok' });
  });

  it('ignores a position for an exercise with no history yet', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    const res = await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 2, tryMoreAfterWorkouts: 3, sessionsDone: 2 }] },
    });
    expect(res.statusCode).toBe(201);
    await logSession(auth, a, '2026-10-01', [8, 8]);
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 0 });
  });

  it('dragging back to the real count clears the shift', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    for (const date of ['2026-10-01', '2026-10-03', '2026-10-05']) await logSession(auth, a, date, [8, 8]);
    const body = (sessionsDone: number) => ({
      name: 'A',
      exercises: [{ exerciseId: a, targetSets: 2, tryMoreAfterWorkouts: 5, sessionsDone }],
    });
    const created = await app.inject({ method: 'POST', url: '/api/programs', headers: auth, payload: body(0) });
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 0 });

    await app.inject({ method: 'PUT', url: `/api/programs/${created.json().id}`, headers: auth, payload: body(2) });
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 2 });
    await logSession(auth, a, '2026-10-07', [8, 8]);
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 3 }); // no leftover shift
  });

  it('rejects an out-of-range position', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    const res = await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 2, sessionsDone: -1 }] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('journal progressAt', () => {
  async function logWorkout(
    auth: Record<string, string>,
    date: string,
    exerciseId: string,
    reps: number[],
    programId?: string,
  ) {
    const started = await app.inject({
      method: 'POST',
      url: '/api/workouts',
      headers: auth,
      payload: programId ? { date, programId } : { date },
    });
    expect(started.statusCode).toBe(201);
    await app.inject({
      method: 'PUT',
      url: `/api/workouts/${started.json().id}/exercises`,
      headers: auth,
      payload: {
        exercises: [
          { exerciseId, weightPerUnitKg: 20, weightUnits: 2, sets: reps.map((r, i) => ({ setNumber: i + 1, reps: r })) },
        ],
      },
    });
  }

  type ListedWorkout = {
    date: string;
    workoutExercises: {
      progressAt: {
        isFirst: boolean;
        isProgress: boolean;
        sessionsSinceProgress: number;
        tryMoreAfterWorkouts: number | null;
      } | null;
    }[];
  };

  async function journal(auth: Record<string, string>) {
    const res = await app.inject({ method: 'GET', url: '/api/workouts', headers: auth });
    expect(res.statusCode).toBe(200);
    const byDate = new Map<string, ListedWorkout['workoutExercises'][number]['progressAt']>();
    for (const w of res.json().data as ListedWorkout[]) byDate.set(w.date, w.workoutExercises[0]?.progressAt ?? null);
    return byDate;
  }

  it('shows the counter as of each workout, with the program threshold', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    const created = await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 2, tryMoreAfterWorkouts: 4 }] },
    });
    const programId = created.json().id as string;
    await logWorkout(auth, '2026-10-01', a, [8, 8], programId);
    await logWorkout(auth, '2026-10-03', a, [8, 8, 8], programId);
    await logWorkout(auth, '2026-10-05', a, [8, 8, 8]);

    const byDate = await journal(auth);
    expect(byDate.get('2026-10-01')).toMatchObject({ isFirst: true, sessionsSinceProgress: 0, tryMoreAfterWorkouts: 4 });
    expect(byDate.get('2026-10-03')).toMatchObject({ isProgress: true, sessionsSinceProgress: 0 });
    // Not started from the program -> the smallest threshold across programs (also 4).
    expect(byDate.get('2026-10-05')).toMatchObject({ isProgress: false, sessionsSinceProgress: 1, tryMoreAfterWorkouts: 4 });

    // The slider shift shows on the latest workout only.
    await app.inject({
      method: 'PUT',
      url: `/api/programs/${programId}`,
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 2, tryMoreAfterWorkouts: 4, sessionsDone: 3 }] },
    });
    const shifted = await journal(auth);
    expect(shifted.get('2026-10-05')).toMatchObject({ sessionsSinceProgress: 3 });
    expect(shifted.get('2026-10-03')).toMatchObject({ sessionsSinceProgress: 0 });
  });

  it('shows the count, not "first time", once the slider moved the latest session', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    await logWorkout(auth, '2026-10-01', a, [8, 8]);
    await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 2, tryMoreAfterWorkouts: 4, sessionsDone: 3 }] },
    });
    expect((await journal(auth)).get('2026-10-01')).toMatchObject({
      isFirst: false,
      isProgress: false,
      sessionsSinceProgress: 3,
    });
  });

  it('handles a page with an empty workout', async () => {
    const { auth } = await registerUser(app);
    expect((await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: {} })).statusCode).toBe(201);
    const res = await app.inject({ method: 'GET', url: '/api/workouts', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].workoutExercises).toEqual([]);
  });
});
