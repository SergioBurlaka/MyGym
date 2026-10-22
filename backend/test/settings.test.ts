import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  await app.close();
});

function patch(auth: Record<string, string>, payload: unknown) {
  return app.inject({ method: 'PATCH', url: '/api/settings', headers: auth, payload: payload as object });
}

describe('settings', () => {
  it('returns defaults for a new user, calendar not connected', async () => {
    const { auth } = await registerUser(app);
    const res = await app.inject({ method: 'GET', url: '/api/settings', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      trainingDays: [1, 3, 5],
      trainingTime: '18:00',
      trainingDurationMin: 60,
      timezone: 'Europe/Kyiv',
      calendarConnected: false,
      calendarConnectedAt: null,
    });
  });

  it('updates only the fields in the body', async () => {
    const { auth } = await registerUser(app);
    const res = await patch(auth, { trainingTime: '07:45', trainingDurationMin: 90, timezone: 'America/New_York' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      trainingDays: [1, 3, 5],
      trainingTime: '07:45',
      trainingDurationMin: 90,
      timezone: 'America/New_York',
    });
  });

  it('accepts a timezone alias a browser may report', async () => {
    const { auth } = await registerUser(app);
    expect((await patch(auth, { timezone: 'Europe/Kiev' })).statusCode).toBe(200);
  });

  it.each([
    [{ trainingTime: '24:00' }],
    [{ trainingTime: '7:30' }],
    [{ trainingDurationMin: 10 }],
    [{ trainingDurationMin: 301 }],
    [{ timezone: 'Mars/Olympus' }],
    [{}],
  ])('rejects %j', async (payload) => {
    const { auth } = await registerUser(app);
    const res = await patch(auth, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('validation_error');
  });

  it('writes schedule history only when trainingDays change', async () => {
    const { auth, user } = await registerUser(app);
    const historyRows = () =>
      db.select().from(trainingScheduleHistory).where(eq(trainingScheduleHistory.userId, user.id));
    const before = await historyRows();

    await patch(auth, { trainingTime: '06:00', timezone: 'Europe/Warsaw' });
    expect(await historyRows()).toEqual(before);

    await patch(auth, { trainingDays: [2, 4] });
    const after = await historyRows();
    expect(after.map((r) => r.trainingDays)).toContainEqual([2, 4]);
  });
});
