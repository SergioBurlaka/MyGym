import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { exercises, programExercises, programs, sets, users, workoutExercises } from '../src/db/schema.js';
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

describe('check constraints', () => {
  const PG_CHECK_VIOLATION = '23514';

  async function rejected(promise: Promise<unknown>) {
    const err = await promise.then(
      () => null,
      (e: { code?: string; cause?: { code?: string } }) => e,
    );
    expect(err?.code ?? err?.cause?.code).toBe(PG_CHECK_VIOLATION);
  }

  it('reject values the API would never accept', async () => {
    const { userId, exerciseId } = await userWithHistory();
    const [we] = await db.select().from(workoutExercises).where(eq(workoutExercises.exerciseId, exerciseId));

    await rejected(db.update(sets).set({ reps: -1 }).where(eq(sets.workoutExerciseId, we.id)));
    await rejected(db.update(sets).set({ setNumber: 0 }).where(eq(sets.workoutExerciseId, we.id)));
    await rejected(db.update(workoutExercises).set({ weightUnits: 3 }).where(eq(workoutExercises.id, we.id)));
    await rejected(db.update(workoutExercises).set({ weightPerUnitKg: '-5' }).where(eq(workoutExercises.id, we.id)));
    // No weight but units set.
    await rejected(db.update(workoutExercises).set({ weightPerUnitKg: null }).where(eq(workoutExercises.id, we.id)));
    await rejected(db.update(exercises).set({ repRangeMin: 20, repRangeMax: 10 }).where(eq(exercises.id, exerciseId)));
    await rejected(db.update(exercises).set({ weightStepKg: '51' }).where(eq(exercises.id, exerciseId)));
    await rejected(db.update(programExercises).set({ targetSets: 0 }).where(eq(programExercises.exerciseId, exerciseId)));
    await rejected(db.update(programs).set({ tryMoreAfterWorkouts: 0 }).where(eq(programs.userId, userId)));
    await rejected(db.update(users).set({ trainingDurationMin: 5 }).where(eq(users.id, userId)));
  });

  it('accept a bodyweight row with neither weight nor units', async () => {
    const { exerciseId } = await userWithHistory();
    const [we] = await db.select().from(workoutExercises).where(eq(workoutExercises.exerciseId, exerciseId));
    await db.update(workoutExercises).set({ weightPerUnitKg: null, weightUnits: null }).where(eq(workoutExercises.id, we.id));
  });

  it('keeps one row per exercise in a program', async () => {
    const { exerciseId } = await userWithHistory();
    const [pe] = await db.select().from(programExercises).where(eq(programExercises.exerciseId, exerciseId));
    await expect(
      db.insert(programExercises).values({ programId: pe.programId, exerciseId, targetSets: 2 }),
    ).rejects.toMatchObject({ code: '23505' });
  });
});

describe('exercise names', () => {
  async function create(auth: Record<string, string>, name: string) {
    return app.inject({
      method: 'POST',
      url: '/api/exercises',
      headers: auth,
      payload: { name, equipment: 'dumbbell', category: 'small', repRangeMin: 8, repRangeMax: 12 },
    });
  }

  it('refuses a duplicate name, ignoring case and edge spaces', async () => {
    const { auth } = await registerUser(app);
    expect((await create(auth, 'Шраги')).statusCode).toBe(201);
    const dup = await create(auth, '  шраги ');
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('exercise_name_taken');
  });

  it('lets another user use the same name', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    expect((await create(a.auth, 'Шраги')).statusCode).toBe(201);
    expect((await create(b.auth, 'Шраги')).statusCode).toBe(201);
  });

  it("restores an archived exercise when its name is created again", async () => {
    const { auth } = await registerUser(app);
    const first = (await create(auth, 'Шраги')).json();
    await app.inject({ method: 'DELETE', url: `/api/exercises/${first.id}`, headers: auth });
    const again = await create(auth, 'шраги');
    expect(again.statusCode).toBe(201);
    expect(again.json()).toMatchObject({ id: first.id, name: 'шраги', archivedAt: null });
  });

  it('refuses renaming onto a taken name', async () => {
    const { auth } = await registerUser(app);
    await create(auth, 'Шраги');
    const other = (await create(auth, 'Тяга до підборіддя')).json();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/exercises/${other.id}`,
      headers: auth,
      payload: { name: 'ШРАГИ' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('exercise_name_taken');
  });

  it('refuses a lone repRangeMin above the stored max with 400, not 500', async () => {
    const { auth } = await registerUser(app);
    const ex = (await create(auth, 'Шраги')).json();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/exercises/${ex.id}`,
      headers: auth,
      payload: { repRangeMin: 20 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('rep_range_invalid');
  });
});
