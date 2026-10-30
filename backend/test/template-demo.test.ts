import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { createTestApp, refreshCookie, registerUser, resetDb } from './helpers.js';
import { db } from '../src/db/client.js';
import { exercises, refreshTokens, trainingScheduleHistory, users, workouts } from '../src/db/schema.js';
import { env } from '../src/config/env.js';
import { DEMO_EMAIL, DEMO_RESET_AFTER_MS } from '../src/modules/template/demo.service.js';
import { SAMPLE_WORKOUT_COUNT } from '../src/modules/template/template.service.js';

let app: FastifyInstance;

beforeEach(async () => {
  await resetDb();
  app = await createTestApp();
});

afterEach(async () => {
  env.TEMPLATE_ACCOUNT_EMAIL = undefined;
  await app.close();
});

const TEMPLATE_EMAIL = 'template-owner@example.com';
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

type Auth = Record<string, string>;

async function exerciseList(auth: Auth) {
  const res = await app.inject({ method: 'GET', url: '/api/exercises', headers: auth });
  return res.json() as { id: string; name: string }[];
}

// A template account with two programs (one with a custom exercise) and six
// finished workouts, the latest `latestDaysAgo` days ago, a few days apart.
async function setUpTemplate(latestDaysAgo = 20) {
  const owner = await registerUser(app, TEMPLATE_EMAIL);
  const list = await exerciseList(owner.auth);
  const custom = await app.inject({
    method: 'POST',
    url: '/api/exercises',
    headers: owner.auth,
    payload: { name: 'Owner Custom Curl', equipment: 'dumbbell', category: 'small', repRangeMin: 8, repRangeMax: 12 },
  });
  expect(custom.statusCode).toBe(201);
  const customId = custom.json().id as string;

  const programIds: string[] = [];
  for (const [name, ids] of [
    ['A', [list[0].id, customId]],
    ['B', [list[1].id]],
  ] as const) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/programs',
      headers: owner.auth,
      payload: { name, exercises: ids.map((exerciseId) => ({ exerciseId, targetSets: 3, tryMoreAfterWorkouts: 5 })) },
    });
    expect(res.statusCode).toBe(201);
    programIds.push(res.json().id);
  }

  const dates: string[] = [];
  for (let i = 0; i < 6; i++) {
    const started = await app.inject({
      method: 'POST',
      url: '/api/workouts',
      headers: owner.auth,
      payload: { programId: programIds[i % 2] },
    });
    const id = started.json().id as string;
    await app.inject({
      method: 'PUT',
      url: `/api/workouts/${id}/exercises`,
      headers: owner.auth,
      payload: {
        exercises: [
          {
            exerciseId: i % 2 === 0 ? customId : list[1].id,
            weightPerUnitKg: 10 + i,
            weightUnits: 2,
            sets: [
              { setNumber: 1, reps: 8 },
              { setNumber: 2, reps: 9 },
            ],
          },
        ],
      },
    });
    await app.inject({ method: 'POST', url: `/api/workouts/${id}/finish`, headers: owner.auth });
    const date = daysAgo(latestDaysAgo + (5 - i) * 2);
    dates.push(date);
    await db.update(workouts).set({ date }).where(eq(workouts.id, id));
  }
  env.TEMPLATE_ACCOUNT_EMAIL = TEMPLATE_EMAIL;
  return { owner, customId, dates };
}

async function journal(auth: Auth) {
  const res = await app.inject({ method: 'GET', url: '/api/workouts?pageSize=100', headers: auth });
  return res.json() as {
    data: {
      id: string;
      date: string;
      isSample: boolean;
      programId: string | null;
      workoutExercises: { exerciseId: string; sets: unknown[] }[];
    }[];
    sampleCount: number;
  };
}

async function demoLogin() {
  const res = await app.inject({ method: 'POST', url: '/api/auth/demo' });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { accessToken: string; user: { id: string; email: string; isDemo: boolean } };
  return { ...body, cookie: refreshCookie(res), auth: { authorization: `Bearer ${body.accessToken}` } };
}

describe('without a template account', () => {
  it('has no demo and new accounts start with exercises only', async () => {
    const providers = await app.inject({ method: 'GET', url: '/api/auth/providers' });
    expect(providers.json().demo).toBe(false);
    expect((await app.inject({ method: 'POST', url: '/api/auth/demo' })).statusCode).toBe(404);

    const { auth } = await registerUser(app);
    expect((await journal(auth)).data).toHaveLength(0);
    const progs = await app.inject({ method: 'GET', url: '/api/programs', headers: auth });
    expect(progs.json()).toHaveLength(0);
  });
});

describe('starter data for a new account', () => {
  it('copies all programs and the latest workouts as samples, weekdays kept', async () => {
    const { dates } = await setUpTemplate();
    const { auth, user } = await registerUser(app);

    const progs = await app.inject({ method: 'GET', url: '/api/programs', headers: auth });
    const programs = progs.json() as { id: string; name: string; programExercises: { exerciseId: string; tryMoreAfterWorkouts: number | null }[] }[];
    expect(programs.map((p) => p.name).sort()).toEqual(['A', 'B']);
    expect(programs.flatMap((p) => p.programExercises).every((pe) => pe.tryMoreAfterWorkouts === 5)).toBe(true);

    // The custom exercise was created for the new user; default ones matched by name.
    const own = await exerciseList(auth);
    const ownIds = new Set(own.map((e) => e.id));
    expect(own.some((e) => e.name === 'Owner Custom Curl')).toBe(true);
    expect(programs.flatMap((p) => p.programExercises).every((e) => ownIds.has(e.exerciseId))).toBe(true);

    const { data, sampleCount } = await journal(auth);
    expect(data).toHaveLength(SAMPLE_WORKOUT_COUNT);
    expect(sampleCount).toBe(SAMPLE_WORKOUT_COUNT);
    expect(data.every((w) => w.isSample)).toBe(true);
    expect(data.every((w) => w.workoutExercises.every((we) => ownIds.has(we.exerciseId) && we.sets.length === 2))).toBe(true);
    const programIds = new Set(programs.map((p) => p.id));
    expect(data.every((w) => w.programId && programIds.has(w.programId))).toBe(true);

    // Shifted into the past week, by whole weeks.
    const latest = data[0].date;
    expect(latest <= daysAgo(1) && latest >= daysAgo(7)).toBe(true);
    const sourceLatest = [...dates].sort().reverse().slice(0, SAMPLE_WORKOUT_COUNT);
    expect(data.map((w) => weekday(w.date))).toEqual(sourceLatest.map(weekday));

    // The schedule history starts at the first sample, so the calendar judges those days.
    const history = await db.query.trainingScheduleHistory.findMany({
      where: eq(trainingScheduleHistory.userId, user.id),
    });
    expect(history).toHaveLength(1);
    expect(history[0].effectiveFrom).toBe(data[data.length - 1].date);
  });

  it("takes the template's training days, for the account and its calendar history", async () => {
    const { owner } = await setUpTemplate();
    await app.inject({ method: 'PATCH', url: '/api/settings', headers: owner.auth, payload: { trainingDays: [2, 4, 6] } });
    const { auth, user } = await registerUser(app);

    const settings = await app.inject({ method: 'GET', url: '/api/settings', headers: auth });
    expect(settings.json().trainingDays).toEqual([2, 4, 6]);
    const history = await db.query.trainingScheduleHistory.findMany({
      where: eq(trainingScheduleHistory.userId, user.id),
    });
    expect(history.map((h) => h.trainingDays)).toEqual([[2, 4, 6]]);
  });

  it('deleting the samples one by one also moves the schedule start back', async () => {
    await setUpTemplate();
    const { auth, user } = await registerUser(app);
    for (const w of (await journal(auth)).data) {
      await app.inject({ method: 'DELETE', url: `/api/workouts/${w.id}`, headers: auth });
    }
    const [history] = await db.query.trainingScheduleHistory.findMany({
      where: eq(trainingScheduleHistory.userId, user.id),
    });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(history.effectiveFrom).toBe(row.createdAt.toISOString().slice(0, 10));
  });

  it('skips an empty template workout - a sample has to show something', async () => {
    const { owner } = await setUpTemplate();
    const empty = await app.inject({ method: 'POST', url: '/api/workouts', headers: owner.auth, payload: {} });
    await app.inject({ method: 'POST', url: `/api/workouts/${empty.json().id}/finish`, headers: owner.auth });

    const { auth } = await registerUser(app);
    const { data } = await journal(auth);
    expect(data).toHaveLength(SAMPLE_WORKOUT_COUNT);
    expect(data.every((w) => w.workoutExercises.length > 0)).toBe(true);
  });

  it('a template workout from today lands a week back, not in the future', async () => {
    await setUpTemplate(0);
    const { auth } = await registerUser(app);
    const { data } = await journal(auth);
    expect(data[0].date).toBe(daysAgo(7));
  });

  it("doesn't change the template account", async () => {
    const { owner } = await setUpTemplate();
    const before = await journal(owner.auth);
    await registerUser(app);
    const after = await journal(owner.auth);
    expect(after.data.map((w) => w.id)).toEqual(before.data.map((w) => w.id));
    expect(after.sampleCount).toBe(0);
  });

  it('"remove samples" deletes them, keeps programs and moves the schedule start back', async () => {
    await setUpTemplate();
    const { auth, user } = await registerUser(app);

    const res = await app.inject({ method: 'DELETE', url: '/api/workouts/samples', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().removed).toBe(SAMPLE_WORKOUT_COUNT);
    const { data, sampleCount } = await journal(auth);
    expect(data).toHaveLength(0);
    expect(sampleCount).toBe(0);
    expect((await app.inject({ method: 'GET', url: '/api/programs', headers: auth })).json()).toHaveLength(2);

    const [history] = await db.query.trainingScheduleHistory.findMany({
      where: eq(trainingScheduleHistory.userId, user.id),
    });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(history.effectiveFrom).toBe(row.createdAt.toISOString().slice(0, 10));
  });
});

describe('demo account', () => {
  it('logs in without credentials into a copy of the template', async () => {
    const { owner } = await setUpTemplate();
    expect((await app.inject({ method: 'GET', url: '/api/auth/providers' })).json().demo).toBe(true);

    const demo = await demoLogin();
    expect(demo.user).toMatchObject({ email: DEMO_EMAIL, isDemo: true });
    const demoJournal = await journal(demo.auth);
    const ownerJournal = await journal(owner.auth);
    expect(demoJournal.data.map((w) => w.date)).toEqual(ownerJournal.data.map((w) => w.date));
    expect(demoJournal.data.every((w) => !w.isSample)).toBe(true);
    expect(demoJournal.data.every((w) => !ownerJournal.data.some((o) => o.id === w.id))).toBe(true);

    // A second visitor gets the same account, not another copy.
    const again = await demoLogin();
    expect(again.user.id).toBe(demo.user.id);
    expect((await journal(again.auth)).data).toHaveLength(ownerJournal.data.length);
  });

  it("changes in the demo don't touch the template", async () => {
    const { owner } = await setUpTemplate();
    const demo = await demoLogin();
    const before = await journal(owner.auth);

    for (const w of (await journal(demo.auth)).data) {
      await app.inject({ method: 'DELETE', url: `/api/workouts/${w.id}`, headers: demo.auth });
    }
    expect((await journal(demo.auth)).data).toHaveLength(0);
    expect((await journal(owner.auth)).data).toHaveLength(before.data.length);
    expect(await db.select().from(exercises).where(eq(exercises.userId, owner.user.id))).toHaveLength(14);
  });

  it('is copied again once a day old, keeping the account', async () => {
    await setUpTemplate();
    const demo = await demoLogin();
    for (const w of (await journal(demo.auth)).data) {
      await app.inject({ method: 'DELETE', url: `/api/workouts/${w.id}`, headers: demo.auth });
    }

    // Still fresh: the next visitor sees the emptied demo.
    expect((await journal((await demoLogin()).auth)).data).toHaveLength(0);

    await db
      .update(users)
      .set({ demoResetAt: new Date(Date.now() - DEMO_RESET_AFTER_MS - 1000) })
      .where(eq(users.id, demo.user.id));
    const next = await demoLogin();
    expect(next.user.id).toBe(demo.user.id);
    expect((await journal(next.auth)).data).toHaveLength(6);
    // The first visitor's session survives the reset.
    expect((await journal(demo.auth)).data).toHaveLength(6);
  });

  it('refuses tokens, calendar links and OAuth approvals', async () => {
    await setUpTemplate();
    const { auth } = await demoLogin();

    const token = await app.inject({ method: 'POST', url: '/api/tokens', headers: auth, payload: { name: 'x' } });
    expect(token.statusCode).toBe(403);
    expect(token.json().error).toBe('demo_forbidden');
    const calendar = await app.inject({ method: 'POST', url: '/api/calendar/token', headers: auth, payload: {} });
    expect(calendar.statusCode).toBe(403);
    const grants = await app.inject({ method: 'GET', url: '/api/oauth/grants', headers: auth });
    expect(grants.statusCode).toBe(403);
  });

  it('gives a demo visitor a one-day session, not the usual 30 days', async () => {
    await setUpTemplate();
    const res = await app.inject({ method: 'POST', url: '/api/auth/demo' });
    const raw = res.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw : [raw]).find((c) => String(c).startsWith('mygym_refresh='));
    const maxAge = Number(/Max-Age=(\d+)/i.exec(String(cookie))?.[1]);
    expect(maxAge).toBeLessThanOrEqual(DAY_MS / 1000);
    expect(maxAge).toBeGreaterThan(DAY_MS / 1000 - 60);

    const demo = await demoLogin();
    const rows = await db.query.refreshTokens.findMany({ where: eq(refreshTokens.userId, demo.user.id) });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(DAY_MS);
      expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(DAY_MS - 60_000);
    }
  });

  it('keeps the demo session a demo across a refresh', async () => {
    await setUpTemplate();
    const { cookie } = await demoLogin();
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(Buffer.from(res.json().accessToken.split('.')[1], 'base64url').toString());
    expect(payload.demo).toBe(true);
  });

  it("the demo email can't be registered", async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: DEMO_EMAIL, password: 'correct-horse-battery' },
    });
    expect(res.statusCode).toBe(409);
    const [taken] = await db.select().from(users).where(and(eq(users.email, DEMO_EMAIL)));
    expect(taken).toBeUndefined();
  });
});
