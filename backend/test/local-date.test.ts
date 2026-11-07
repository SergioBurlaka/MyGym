import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { trainingScheduleHistory } from '../src/db/schema.js';
import { createTestApp, registerUser, resetDb } from './helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  await resetDb();
  app = await createTestApp();
});

afterEach(async () => {
  vi.useRealTimers();
  await app.close();
});

// Only Date: real timers keep the database driver and Fastify running.
function setClock(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

function setTimezone(auth: Record<string, string>, timezone: string) {
  return app.inject({ method: 'PATCH', url: '/api/settings', headers: auth, payload: { timezone } });
}

async function startWorkout(auth: Record<string, string>, payload: object = {}) {
  const res = await app.inject({ method: 'POST', url: '/api/workouts', headers: auth, payload });
  expect(res.statusCode).toBe(201);
  return res.json() as { date: string };
}

async function scheduleDates(userId: string) {
  const rows = await db.query.trainingScheduleHistory.findMany({
    where: eq(trainingScheduleHistory.userId, userId),
  });
  return rows.map((r) => r.effectiveFrom);
}

describe('dates around midnight follow the user time zone', () => {
  it('a workout started after midnight in Kyiv gets the new day', async () => {
    setClock('2026-11-06T23:45:00Z'); // 01:45 on the 7th in Kyiv
    const { auth } = await registerUser(app);
    expect((await startWorkout(auth)).date).toBe('2026-11-07');
  });

  it('a workout started before midnight in New York keeps the old day', async () => {
    setClock('2026-11-07T02:00:00Z'); // 21:00 on the 6th in New York
    const { auth } = await registerUser(app);
    await setTimezone(auth, 'America/New_York');
    expect((await startWorkout(auth)).date).toBe('2026-11-06');
  });

  it('an explicit date wins', async () => {
    setClock('2026-11-06T23:45:00Z');
    const { auth } = await registerUser(app);
    expect((await startWorkout(auth, { date: '2026-11-01' })).date).toBe('2026-11-01');
  });

  // A past date on purpose: the registration row comes from the database's real
  // clock, and matching it would pass these without the change's own row.
  it('a schedule change gets the local day', async () => {
    setClock('2026-03-14T23:45:00Z'); // 01:45 on the 15th in Kyiv
    const { auth, user } = await registerUser(app);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: auth,
      payload: { trainingDays: [2, 4] },
    });
    expect(res.statusCode).toBe(200);
    expect(await scheduleDates(user.id)).toContain('2026-03-15');
  });

  it('a schedule change uses the time zone sent with it', async () => {
    setClock('2026-03-15T02:00:00Z'); // 22:00 on the 14th in New York
    const { auth, user } = await registerUser(app);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: auth,
      payload: { trainingDays: [2, 4], timezone: 'America/New_York' },
    });
    expect(res.statusCode).toBe(200);
    expect(await scheduleDates(user.id)).toContain('2026-03-14');
  });
});
