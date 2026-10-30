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

// Dates relative to today, so a test's sessions never look like they were
// before a long training break (that would reset the try-more counter).
function day(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

type OverviewRow = {
  exerciseId: string;
  category: 'large' | 'small' | 'bodyweight';
  tryMoreAfterWorkouts: number;
  tryMoreIsDefault: boolean;
};

async function overviewRow(auth: Record<string, string>, exerciseId: string): Promise<OverviewRow> {
  const res = await app.inject({ method: 'GET', url: '/api/progression', headers: auth });
  expect(res.statusCode).toBe(200);
  return (res.json() as OverviewRow[]).find((p) => p.exerciseId === exerciseId)!;
}

async function overviewThreshold(auth: Record<string, string>, exerciseId: string) {
  return (await overviewRow(auth, exerciseId)).tryMoreAfterWorkouts;
}

describe('fixed number of sets (lockSets)', () => {
  it('defaults to false, saves it and returns it with the program', async () => {
    const { auth } = await registerUser(app);
    const [a, b] = await exerciseIds(auth);
    const res = await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: {
        name: 'A',
        exercises: [
          { exerciseId: a, targetSets: 4, lockSets: true },
          { exerciseId: b, targetSets: 3 },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const program = res.json() as { id: string; programExercises: { lockSets: boolean }[] };
    expect(program.programExercises.map((pe) => pe.lockSets)).toEqual([true, false]);

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/programs/${program.id}`,
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 4, lockSets: false }, { exerciseId: b, targetSets: 3, lockSets: true }] },
    });
    expect(updated.statusCode).toBe(200);
    expect((updated.json() as { programExercises: { lockSets: boolean }[] }).programExercises.map((pe) => pe.lockSets)).toEqual([false, true]);
  });

  it('rejects a non-boolean value', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    const res = await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 3, lockSets: 'yes' }] },
    });
    expect(res.statusCode).toBe(400);
  });
});

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

  it('is the own value, else the category default, the smallest across programs', async () => {
    const { auth } = await registerUser(app);
    const [a, b, c] = await exerciseIds(auth);
    await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: {
        name: 'A',
        exercises: [
          { exerciseId: a, targetSets: 3, tryMoreAfterWorkouts: 5 },
          { exerciseId: b, targetSets: 3 },
          { exerciseId: c, targetSets: 3 },
        ],
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'B', exercises: [{ exerciseId: b, targetSets: 3, tryMoreAfterWorkouts: 3 }] },
    });

    expect(await overviewThreshold(auth, a)).toBe(5);
    expect(await overviewThreshold(auth, b)).toBe(3); // default (A) vs own 3 (B)
    // In a program, but without an own value -> the category default.
    const rowC = await overviewRow(auth, c);
    expect(rowC.tryMoreIsDefault).toBe(true);
    expect(rowC.tryMoreAfterWorkouts).toBe({ large: 4, small: 6, bodyweight: 5 }[rowC.category]);
  });

  it("ignores an old client's program-wide value instead of refusing it", async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    const created = await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'A', tryMoreAfterWorkouts: 2, exercises: [{ exerciseId: a, targetSets: 3 }] },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).not.toHaveProperty('tryMoreAfterWorkouts');
    const updated = await app.inject({
      method: 'PUT',
      url: `/api/programs/${created.json().id}`,
      headers: auth,
      payload: { name: 'A', tryMoreAfterWorkouts: 2, exercises: [{ exerciseId: a, targetSets: 3 }] },
    });
    expect(updated.statusCode).toBe(200);
    const row = await overviewRow(auth, a);
    expect(row.tryMoreIsDefault).toBe(true);
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

    for (const date of [day(-10), day(-8), day(-6)]) await logSession(auth, a, date, [8, 8]);
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 2 });

    expect((await save(0)).statusCode).toBe(200); // postpone
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 0, suggestion: 'ok' });

    await logSession(auth, a, day(-4), [8, 8]);
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 1 });

    expect((await save(3)).statusCode).toBe(200); // bring forward
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 3, suggestion: 'try_more' });

    // Real progress restarts the count and the shift lapses.
    await logSession(auth, a, day(-2), [8, 8, 8]);
    await logSession(auth, a, day(0), [8, 8, 8]);
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
    await logSession(auth, a, day(-10), [8, 8]);
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 0 });
  });

  it('dragging back to the real count clears the shift', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    for (const date of [day(-10), day(-8), day(-6)]) await logSession(auth, a, date, [8, 8]);
    const body = (sessionsDone: number) => ({
      name: 'A',
      exercises: [{ exerciseId: a, targetSets: 2, tryMoreAfterWorkouts: 5, sessionsDone }],
    });
    const created = await app.inject({ method: 'POST', url: '/api/programs', headers: auth, payload: body(0) });
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 0 });

    await app.inject({ method: 'PUT', url: `/api/programs/${created.json().id}`, headers: auth, payload: body(2) });
    expect(await counter(auth, a)).toMatchObject({ sessionsSinceProgress: 2 });
    await logSession(auth, a, day(-4), [8, 8]);
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
    return started.json().id as string;
  }

  type ListedWorkout = {
    date: string;
    workoutExercises: {
      progressAt: {
        isFirst: boolean;
        isProgress: boolean;
        afterBreak: boolean;
        sessionsSinceProgress: number;
        tryMoreAfterWorkouts: number;
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
    await logWorkout(auth, day(-10), a, [8, 8], programId);
    await logWorkout(auth, day(-8), a, [8, 8, 8], programId);
    await logWorkout(auth, day(-6), a, [8, 8, 8]);

    const byDate = await journal(auth);
    expect(byDate.get(day(-10))).toMatchObject({ isFirst: true, sessionsSinceProgress: 0, tryMoreAfterWorkouts: 4 });
    expect(byDate.get(day(-8))).toMatchObject({ isProgress: true, sessionsSinceProgress: 0 });
    // Not started from the program -> the smallest threshold across programs (also 4).
    expect(byDate.get(day(-6))).toMatchObject({ isProgress: false, sessionsSinceProgress: 1, tryMoreAfterWorkouts: 4 });

    // The slider shift shows on the latest workout only.
    await app.inject({
      method: 'PUT',
      url: `/api/programs/${programId}`,
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 2, tryMoreAfterWorkouts: 4, sessionsDone: 3 }] },
    });
    const shifted = await journal(auth);
    expect(shifted.get(day(-6))).toMatchObject({ sessionsSinceProgress: 3 });
    expect(shifted.get(day(-8))).toMatchObject({ sessionsSinceProgress: 0 });
  });

  it('uses the same threshold in the journal and on the workout page, without an own value', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    const created = await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 2 }] },
    });
    const programId = created.json().id as string;
    const category = (await overviewRow(auth, a)).category;
    const standard = { large: 4, small: 6, bodyweight: 5 }[category];
    await logWorkout(auth, day(-8), a, [8, 8], programId);
    const id = await logWorkout(auth, day(-6), a, [8, 8], programId);

    expect((await journal(auth)).get(day(-6))).toMatchObject({ tryMoreAfterWorkouts: standard });
    const page = await app.inject({ method: 'GET', url: `/api/workouts/${id}`, headers: auth });
    const we = page.json().workoutExercises[0];
    expect(we.progressAt.tryMoreAfterWorkouts).toBe(standard);
    expect(we.counterBefore).toEqual({ sessionsSinceProgress: 0, tryMoreAfterWorkouts: standard });
  });

  it('comes with a single workout and with its save response', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    await logWorkout(auth, day(-4), a, [8, 8]);
    const started = await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: { date: day(-2) } });
    const id = started.json().id as string;

    function save(reps: number[]) {
      return app.inject({
        method: 'PUT',
        url: `/api/workouts/${id}/exercises`,
        headers: auth,
        payload: {
          exercises: [
            { exerciseId: a, weightPerUnitKg: 20, weightUnits: 2, sets: reps.map((r, i) => ({ setNumber: i + 1, reps: r })) },
          ],
        },
      });
    }

    // Same as last time -> no progress yet; the response already counts it.
    const same = await save([8, 8]);
    expect(same.statusCode).toBe(200);
    expect(same.json().workoutExercises[0].progressAt).toMatchObject({ isProgress: false, sessionsSinceProgress: 1 });

    // One more rep -> progress, as soon as it's saved.
    const better = await save([8, 9]);
    expect(better.json().workoutExercises[0].progressAt).toMatchObject({ isProgress: true, sessionsSinceProgress: 0 });

    const fetched = await app.inject({ method: 'GET', url: `/api/workouts/${id}`, headers: auth });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().workoutExercises[0].progressAt).toMatchObject({ isProgress: true, sessionsSinceProgress: 0 });
  });

  it('shows the count, not "first time", once the slider moved the latest session', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    await logWorkout(auth, day(-10), a, [8, 8]);
    await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 2, tryMoreAfterWorkouts: 4, sessionsDone: 3 }] },
    });
    expect((await journal(auth)).get(day(-10))).toMatchObject({
      isFirst: false,
      isProgress: false,
      sessionsSinceProgress: 3,
    });
  });

  it('marks the first session after a 14+ day break and restarts the count', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    await logWorkout(auth, day(-40), a, [8, 8]);
    await logWorkout(auth, day(-38), a, [8, 8]);
    // An empty, abandoned workout in the middle doesn't hide the break.
    await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: { date: day(-25) } });
    await logWorkout(auth, day(-10), a, [8, 8]);
    await logWorkout(auth, day(-8), a, [8, 8]);

    const byDate = await journal(auth);
    expect(byDate.get(day(-38))).toMatchObject({ sessionsSinceProgress: 1 });
    expect(byDate.get(day(-10))).toMatchObject({ afterBreak: true, sessionsSinceProgress: 0 });
    expect(byDate.get(day(-8))).toMatchObject({ afterBreak: false, sessionsSinceProgress: 1 });
  });

  it('resets the overview count when the break runs up to today', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    for (const d of [-30, -28, -26, -24, -22]) await logWorkout(auth, day(d), a, [8, 8]);
    const res = await app.inject({ method: 'GET', url: '/api/progression', headers: auth });
    const row = (res.json() as { exerciseId: string; sessionsSinceProgress: number; suggestion: string }[]).find(
      (p) => p.exerciseId === a,
    )!;
    expect(row).toMatchObject({ sessionsSinceProgress: 0, suggestion: 'ok' });
  });

  it('handles a page with an empty workout', async () => {
    const { auth } = await registerUser(app);
    expect((await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: {} })).statusCode).toBe(201);
    const res = await app.inject({ method: 'GET', url: '/api/workouts', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].workoutExercises).toEqual([]);
  });
});

describe('program exercises', () => {
  it('refuses the same exercise twice with a validation error, not a SQL one', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    const res = await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: auth,
      payload: { name: 'A', exercises: [{ exerciseId: a, targetSets: 3 }, { exerciseId: a, targetSets: 2 }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_error', issues: [{ message: 'duplicate_exercise' }] });
  });
});

describe('renaming a program', () => {
  it('renames the label of its workouts, except hand-edited ones and other workouts', async () => {
    const { auth } = await registerUser(app);
    const [a] = await exerciseIds(auth);
    const exercises = [{ exerciseId: a, targetSets: 1 }];
    const created = await app.inject({ method: 'POST', url: '/api/programs', headers: auth, payload: { name: 'А', exercises } });
    const programId = created.json().id as string;

    const start = async (payload: Record<string, unknown>) =>
      (await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload })).json().id as string;
    const fromProgram = await start({ programId });
    const handEdited = await start({ programId });
    await app.inject({ method: 'PATCH', url: `/api/workouts/${handEdited}`, headers: auth, payload: { programLabel: 'А-легке' } });
    const sameLabelNoProgram = await start({ programLabel: 'А' });

    const renamed = await app.inject({
      method: 'PUT',
      url: `/api/programs/${programId}`,
      headers: auth,
      payload: { name: 'Ноги', exercises },
    });
    expect(renamed.statusCode).toBe(200);

    const label = async (id: string) =>
      (await app.inject({ method: 'GET', url: `/api/workouts/${id}`, headers: auth })).json().programLabel;
    expect(await label(fromProgram)).toBe('Ноги');
    expect(await label(handEdited)).toBe('А-легке');
    expect(await label(sameLabelNoProgram)).toBe('А');
  });
});
