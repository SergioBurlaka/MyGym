import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { exercises, users, workoutExercises } from '../src/db/schema.js';
import { createTestApp, registerUser, resetDb } from './helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  await resetDb();
  app = await createTestApp();
});

afterEach(async () => {
  await app.close();
});

async function userWithHistory() {
  const { auth, user } = await registerUser(app);
  const list = await app.inject({ method: 'GET', url: '/api/exercises', headers: auth });
  const exerciseId = (list.json() as { id: string }[])[0].id;
  await app.inject({
    method: 'POST',
    url: '/api/programs',
    headers: auth,
    payload: { name: 'A', exercises: [{ exerciseId, targetSets: 2 }] },
  });
  const started = await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: {} });
  await app.inject({
    method: 'PUT',
    url: `/api/workouts/${started.json().id}/exercises`,
    headers: auth,
    payload: { exercises: [{ exerciseId, weightPerUnitKg: 20, weightUnits: 2, sets: [{ setNumber: 1, reps: 8 }] }] },
  });
  return { userId: user.id, exerciseId };
}

// The exercise FKs of workout_exercises / program_exercises are DEFERRABLE
// INITIALLY DEFERRED (migration 0019). Tests TRUNCATE ... CASCADE between
// runs, so without these the old RESTRICT bug went unnoticed.
describe('exercise foreign keys', () => {
  it('lets a user with workouts and programs be deleted', async () => {
    const { userId, exerciseId } = await userWithHistory();
    await db.delete(users).where(eq(users.id, userId));
    expect(await db.select().from(exercises).where(eq(exercises.id, exerciseId))).toEqual([]);
    expect(await db.select().from(workoutExercises).where(eq(workoutExercises.exerciseId, exerciseId))).toEqual([]);
  });

  it('still refuses to delete an exercise that is in the history', async () => {
    const { exerciseId } = await userWithHistory();
    await expect(db.delete(exercises).where(eq(exercises.id, exerciseId))).rejects.toMatchObject({
      code: '23503',
    });
    expect(await db.select().from(exercises).where(eq(exercises.id, exerciseId))).toHaveLength(1);
  });
});
