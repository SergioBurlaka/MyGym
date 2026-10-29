import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { createTestApp, registerUser, resetDb } from './helpers.js';
import { db } from '../src/db/client.js';
import { exercises, workoutExercises } from '../src/db/schema.js';

let app: FastifyInstance;

beforeEach(async () => {
  await resetDb();
  app = await createTestApp();
});

afterEach(async () => {
  await app.close();
});

// Dates relative to today, so the sessions never look like they were
// before a long training break (that would reset the try-more counter).
function day(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

type Exercise = {
  id: string;
  name: string;
  equipment: string;
  unilateral: boolean;
  limb: string | null;
  defaultBarKg: string | null;
};

async function listExercises(auth: Record<string, string>): Promise<Exercise[]> {
  const res = await app.inject({ method: 'GET', url: '/api/exercises', headers: auth });
  return res.json() as Exercise[];
}

async function byName(auth: Record<string, string>, name: string): Promise<Exercise> {
  return (await listExercises(auth)).find((e) => e.name === name)!;
}

async function startWorkout(auth: Record<string, string>, date: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload: { date } });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

async function save(auth: Record<string, string>, workoutId: string, exercisesPayload: unknown[]) {
  const res = await app.inject({
    method: 'PUT',
    url: `/api/workouts/${workoutId}/exercises`,
    headers: auth,
    payload: { exercises: exercisesPayload },
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe('exercise load settings', () => {
  it('seeds a 20 kg bar for barbells and unilateral lunges / French press', async () => {
    const { auth } = await registerUser(app);
    expect(await byName(auth, 'Тяга в нахилі')).toMatchObject({ defaultBarKg: '20.00', unilateral: false, limb: null });
    expect(await byName(auth, 'Випади')).toMatchObject({ defaultBarKg: null, unilateral: true, limb: 'leg' });
    expect(await byName(auth, 'Французький жим сидячи')).toMatchObject({ unilateral: true, limb: 'arm' });
  });

  it('keeps a bar only for a barbell and a limb only when unilateral', async () => {
    const { auth } = await registerUser(app);
    const created = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      headers: auth,
      payload: {
        name: 'Hammer curl',
        equipment: 'dumbbell',
        category: 'small',
        repRangeMin: 6,
        repRangeMax: 20,
        limb: 'arm',
        defaultBarKg: 15,
      },
    });
    expect(created.statusCode).toBe(201);
    const ex = created.json() as Exercise;
    expect(ex).toMatchObject({ unilateral: false, limb: null, defaultBarKg: null });

    // To a barbell: the default 20 kg bar appears; unilateral keeps the limb.
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/exercises/${ex.id}`,
      headers: auth,
      payload: { equipment: 'barbell', unilateral: true, limb: 'arm' },
    });
    expect(patched.json()).toMatchObject({ defaultBarKg: '20.00', unilateral: true, limb: 'arm' });

    const ez = await app.inject({ method: 'PATCH', url: `/api/exercises/${ex.id}`, headers: auth, payload: { defaultBarKg: 10 } });
    expect(ez.json()).toMatchObject({ defaultBarKg: '10.00' });

    const back = await app.inject({
      method: 'PATCH',
      url: `/api/exercises/${ex.id}`,
      headers: auth,
      payload: { equipment: 'dumbbell', unilateral: false },
    });
    expect(back.json()).toMatchObject({ defaultBarKg: null, limb: null });
  });

  it('rejects a bar outside 0-50 kg', async () => {
    const { auth } = await registerUser(app);
    const row = await byName(auth, 'Присідання');
    const res = await app.inject({ method: 'PATCH', url: `/api/exercises/${row.id}`, headers: auth, payload: { defaultBarKg: 60 } });
    expect(res.statusCode).toBe(400);
  });
});

describe('saving weights by equipment', () => {
  it('stores the bar and two sides for a barbell, the dumbbells per rep otherwise', async () => {
    const { auth } = await registerUser(app);
    const row = await byName(auth, 'Тяга в нахилі');
    const press = await byName(auth, 'Французький жим сидячи');
    const legs = await byName(auth, 'Підняття ніг на прес (шведська стінка)');
    const id = await startWorkout(auth, day(-1));

    const saved = await save(auth, id, [
      // weightUnits 1 on a barbell is meaningless - stored as 2; no barKg -> the default bar.
      { exerciseId: row.id, weightPerUnitKg: 16.25, weightUnits: 1, sets: [{ setNumber: 1, reps: 12 }] },
      { exerciseId: press.id, weightPerUnitKg: 5, weightUnits: 1, barKg: 20, sets: [{ setNumber: 1, reps: 12 }] },
      { exerciseId: legs.id, weightPerUnitKg: null, sets: [{ setNumber: 1, reps: 20 }] },
    ]);
    const [r, p, l] = saved.workoutExercises;
    // Nested rows come back from the relational query as JSON - numeric columns are numbers here.
    expect(r).toMatchObject({ weightPerUnitKg: 16.25, weightUnits: 2, barKg: 20, loadPerRepKg: 52.5, volumeKg: 630 });
    expect(p).toMatchObject({ weightUnits: 1, barKg: null, loadPerRepKg: 5, volumeKg: 120 }); // 5 x 12 x 2 arms
    expect(l).toMatchObject({ weightPerUnitKg: null, weightUnits: null, barKg: null, loadPerRepKg: null, volumeKg: null });

    const ez = await save(auth, id, [
      { exerciseId: row.id, weightPerUnitKg: 10, barKg: 10, sets: [{ setNumber: 1, reps: 12 }] },
    ]);
    expect(ez.workoutExercises[0]).toMatchObject({ barKg: 10, loadPerRepKg: 30 });
  });

  it('does not count a heavier bar with the same plates as progress', async () => {
    const { auth } = await registerUser(app);
    const press = await byName(auth, 'Жим стоячи');
    for (const [date, barKg] of [[day(-4), 15], [day(-2), 20]] as const) {
      const id = await startWorkout(auth, date);
      await save(auth, id, [
        { exerciseId: press.id, weightPerUnitKg: 10, barKg, sets: [{ setNumber: 1, reps: 10 }] },
      ]);
    }
    const res = await app.inject({ method: 'GET', url: `/api/progression/${press.id}/history`, headers: auth });
    const history = res.json() as { totalWeightKg: number }[];
    expect(history.map((p) => p.totalWeightKg)).toEqual([35, 40]);

    const journal = await app.inject({ method: 'GET', url: '/api/workouts', headers: auth });
    const latest = journal.json().data[0];
    expect(latest.workoutExercises[0].progressAt).toMatchObject({ isProgress: false, sessionsSinceProgress: 1 });
  });
});

describe('last time and the +1 target on the workout page', () => {
  it('gives the previous session and, once stalled, +1 in the weakest set', async () => {
    const { auth } = await registerUser(app);
    const lunges = await byName(auth, 'Випади');
    const dates = [day(-12), day(-10), day(-8), day(-6), day(-4)];
    for (const date of dates) {
      const id = await startWorkout(auth, date);
      await save(auth, id, [
        {
          exerciseId: lunges.id,
          weightPerUnitKg: 10,
          weightUnits: 2,
          sets: [12, 12, 11].map((reps, i) => ({ setNumber: i + 1, reps })),
        },
      ]);
    }
    // 4 sessions without progress after the first: lunges are "large" -> try more at 4.
    const today = await startWorkout(auth, day(-2));
    const saved = await save(auth, today, [
      { exerciseId: lunges.id, weightPerUnitKg: 10, weightUnits: 2, sets: [{ setNumber: 1, reps: 12 }] },
    ]);
    const we = saved.workoutExercises[0];
    expect(we.previous).toEqual({
      date: day(-4),
      weightPerUnitKg: 10,
      weightUnits: 2,
      barKg: null,
      loadPerRepKg: 20,
      reps: [12, 12, 11],
    });
    expect(we.target).toEqual({ reps: [12, 12, 12], upSetIndex: 2 });

    // Same on a plain GET, and the journal list stays lean.
    const got = await app.inject({ method: 'GET', url: `/api/workouts/${today}`, headers: auth });
    expect(got.json().workoutExercises[0].target).toEqual({ reps: [12, 12, 12], upSetIndex: 2 });
    const journal = await app.inject({ method: 'GET', url: '/api/workouts', headers: auth });
    expect(journal.json().data[0].workoutExercises[0]).not.toHaveProperty('previous');
  });

  it('has no previous session for a first time', async () => {
    const { auth } = await registerUser(app);
    const curl = await byName(auth, 'Піднімання на біцепс');
    const id = await startWorkout(auth, day(-1));
    const saved = await save(auth, id, [
      { exerciseId: curl.id, weightPerUnitKg: 7.5, weightUnits: 2, sets: [{ setNumber: 1, reps: 12 }] },
    ]);
    expect(saved.workoutExercises[0]).toMatchObject({ previous: null, target: null, loadPerRepKg: 15 });
  });
});

// The migration runs once in globalSetup, before any data exists - so run
// its backfill again here on rows shaped like the old ones.
describe('migration 0026: barbell bar backfill', () => {
  async function runBackfill() {
    const text = await readFile(new URL('../migrations/0026_exercise_load_model.sql', import.meta.url), 'utf8');
    const updates = text
      .split('--> statement-breakpoint')
      .map((stmt) => stmt.replace(/^\s*--.*$/gm, '').trim())
      .filter((stmt) => stmt.startsWith('UPDATE'));
    expect(updates).toHaveLength(2);
    for (const stmt of updates) await db.execute(sql.raw(stmt));
  }

  it('gives barbells a 20 kg bar and two sides, leaves the rest alone', async () => {
    const { auth } = await registerUser(app);
    const row = await byName(auth, 'Тяга в нахилі');
    const curl = await byName(auth, 'Піднімання на біцепс');
    const id = await startWorkout(auth, day(-1));
    await save(auth, id, [
      { exerciseId: row.id, weightPerUnitKg: 16.25, sets: [{ setNumber: 1, reps: 12 }] },
      { exerciseId: curl.id, weightPerUnitKg: 7.5, weightUnits: 1, sets: [{ setNumber: 1, reps: 12 }] },
    ]);
    // As before the load model: no bars anywhere, a barbell logged with 1 unit.
    await db.update(exercises).set({ defaultBarKg: null });
    await db.update(workoutExercises).set({ barKg: null, weightUnits: 1 });

    await runBackfill();

    const ex = await db.select().from(exercises).where(eq(exercises.id, row.id));
    expect(ex[0].defaultBarKg).toBe('20.00');
    const wes = await db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, id));
    const rowWe = wes.find((we) => we.exerciseId === row.id)!;
    const curlWe = wes.find((we) => we.exerciseId === curl.id)!;
    expect(rowWe).toMatchObject({ barKg: '20.00', weightUnits: 2 });
    expect(curlWe).toMatchObject({ barKg: null, weightUnits: 1 });
  });
});
