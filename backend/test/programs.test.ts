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
