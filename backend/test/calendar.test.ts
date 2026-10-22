import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import ical, { type VEvent } from 'node-ical';
import { db } from '../src/db/client.js';
import { trainingScheduleHistory, users } from '../src/db/schema.js';
import { buildCalendarFeed, type FeedInput } from '../src/modules/calendar/calendar.ics.js';
import { createTestApp, registerUser, resetDb } from './helpers.js';

function events(ics: string): VEvent[] {
  return Object.values(ical.sync.parseICS(ics)).filter((c): c is VEvent => c.type === 'VEVENT');
}

const baseFeed: FeedInput = {
  userId: '11111111-1111-1111-1111-111111111111',
  history: [{ trainingDays: [1, 3, 5], effectiveFrom: '2026-07-01' }],
  trainingTime: '19:30',
  trainingDurationMin: 60,
  timezone: 'Europe/Kyiv',
  lang: 'en',
  appUrl: 'https://mygym.example',
};

describe('buildCalendarFeed', () => {
  it('starts each series on the first training day at local time', () => {
    const [ev] = events(buildCalendarFeed(baseFeed));
    // 2026-07-01 is a Wednesday; Kyiv is UTC+3 in summer.
    expect(ev.start.toISOString()).toBe('2026-07-01T16:30:00.000Z');
    expect(ev.end.toISOString()).toBe('2026-07-01T17:30:00.000Z');
    expect(ev.summary).toBe('Workout');
    expect(ev.rrule?.toString()).toContain('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  });

  it('keeps local time in winter (no UTC drift across DST)', () => {
    const [ev] = events(
      buildCalendarFeed({ ...baseFeed, history: [{ trainingDays: [2], effectiveFrom: '2026-12-01' }] }),
    );
    // Kyiv is UTC+2 in winter - still 19:30 on the wall clock.
    expect(ev.start.toISOString()).toBe('2026-12-01T17:30:00.000Z');
  });

  it('emits VTIMEZONE and TZID for Europe/Kyiv via its alias', () => {
    const ics = buildCalendarFeed(baseFeed);
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('DTSTART;TZID=Europe/Kiev:20260701T193000');
  });

  it('adds a 30-minute display reminder and refresh hints', () => {
    const ics = buildCalendarFeed(baseFeed);
    expect(events(ics)[0].alarms).toEqual([expect.objectContaining({ action: 'DISPLAY', trigger: '-PT30M' })]);
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT6H');
  });

  it('translates the summary', () => {
    expect(events(buildCalendarFeed({ ...baseFeed, lang: 'uk' }))[0].summary).toBe('Тренування');
  });

  it('ends a series the day before the next schedule takes over', () => {
    const evs = events(
      buildCalendarFeed({
        ...baseFeed,
        history: [
          { trainingDays: [1, 3, 5], effectiveFrom: '2026-07-01' },
          { trainingDays: [2, 4], effectiveFrom: '2026-09-15' },
        ],
      }),
    );
    expect(evs).toHaveLength(2);
    const first = evs.find((e) => e.uid.startsWith('schedule-2026-07-01-'))!;
    const second = evs.find((e) => e.uid.startsWith('schedule-2026-09-15-'))!;
    // Midnight 2026-09-15 in Kyiv (UTC+3) minus one second.
    expect(first.rrule?.options.until?.toISOString()).toBe('2026-09-14T20:59:59.000Z');
    expect(second.rrule?.options.until).toBeFalsy();
    expect(second.rrule?.toString()).toContain('BYDAY=TU,TH');
  });

  it('skips empty schedules and schedules replaced before their first day', () => {
    const evs = events(
      buildCalendarFeed({
        ...baseFeed,
        history: [
          { trainingDays: [], effectiveFrom: '2026-07-01' },
          // Friday-only, replaced on Thursday - never had a training day.
          { trainingDays: [5], effectiveFrom: '2026-08-04' },
          { trainingDays: [1], effectiveFrom: '2026-08-06' },
        ],
      }),
    );
    expect(evs.map((e) => e.uid)).toEqual([`schedule-2026-08-06-${baseFeed.userId}@mygym`]);
  });

  it('uses a bare TZID for Etc/GMT zones (their packaged VTIMEZONE has the sign flipped)', () => {
    // POSIX sign: Etc/GMT-3 is UTC+3.
    const ics = buildCalendarFeed({ ...baseFeed, timezone: 'Etc/GMT-3' });
    expect(ics).not.toContain('BEGIN:VTIMEZONE');
    expect(events(ics)[0].start.toISOString()).toBe('2026-07-01T16:30:00.000Z');
  });

  it('skips a first day whose start time falls into the spring-forward gap', () => {
    // 2026-03-29 (Sunday): Kyiv clocks jump 03:00 -> 04:00, so 03:30 doesn't exist.
    const ics = buildCalendarFeed({
      ...baseFeed,
      trainingTime: '03:30',
      history: [{ trainingDays: [7], effectiveFrom: '2026-03-29' }],
    });
    expect(ics).toContain('DTSTART;TZID=Europe/Kiev:20260405T033000');
  });
});

describe('calendar feed API', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDb();
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  async function connect(auth: Record<string, string>, lang?: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/calendar/token',
      headers: auth,
      payload: lang ? { lang } : {},
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { feedUrl: string; webcalUrl: string; googleUrl: string };
  }

  // feedUrl is absolute (PUBLIC_URL); inject wants the path + query.
  function feedPath(feedUrl: string) {
    const u = new URL(feedUrl);
    return u.pathname + u.search;
  }

  it('requires a session to create a token', async () => {
    const anon = await app.inject({ method: 'POST', url: '/api/calendar/token', payload: {} });
    expect(anon.statusCode).toBe(401);

    const { auth } = await registerUser(app);
    const pat = await app.inject({ method: 'POST', url: '/api/tokens', headers: auth, payload: { name: 'test' } });
    const patAuth = { authorization: `Bearer ${pat.json().token}` };
    const viaPat = await app.inject({ method: 'POST', url: '/api/calendar/token', headers: patAuth, payload: {} });
    expect(viaPat.statusCode).toBe(403);
  });

  it('returns feed URLs and stores only a hash', async () => {
    const { auth, user } = await registerUser(app);
    const urls = await connect(auth, 'uk');
    const token = /(mygym_cal_[a-f0-9]{64})\.ics\?lang=uk$/.exec(urls.feedUrl)?.[1];
    expect(token).toBeDefined();
    expect(urls.webcalUrl).toMatch(/^webcal:\/\//);
    expect(urls.googleUrl).toBe(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(urls.webcalUrl)}`);

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.calendarFeedTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.calendarFeedTokenHash).not.toBe(token);

    const settings = await app.inject({ method: 'GET', url: '/api/settings', headers: auth });
    expect(settings.json()).toMatchObject({ calendarConnected: true });
  });

  it('serves the feed as text/calendar with the user schedule', async () => {
    const { auth } = await registerUser(app);
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: auth,
      payload: { trainingDays: [2, 6], trainingTime: '08:15', timezone: 'Europe/Warsaw' },
    });
    const res = await app.inject({ method: 'GET', url: feedPath((await connect(auth, 'uk')).feedUrl) });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body).toContain('BEGIN:VCALENDAR');
    expect(res.body).toContain('DTSTART;TZID=Europe/Warsaw:');
    const last = events(res.body).sort((a, b) => a.start.getTime() - b.start.getTime()).at(-1)!;
    expect(last.summary).toBe('Тренування');
    expect(last.rrule?.toString()).toContain('BYDAY=TU,SA');
    expect(last.alarms).toHaveLength(1);
  });

  it('builds one series per schedule history row', async () => {
    const { auth, user } = await registerUser(app);
    await db.delete(trainingScheduleHistory).where(eq(trainingScheduleHistory.userId, user.id));
    await db.insert(trainingScheduleHistory).values([
      { userId: user.id, trainingDays: [1, 3, 5], effectiveFrom: '2026-07-01' },
      { userId: user.id, trainingDays: [2, 4], effectiveFrom: '2026-09-15' },
    ]);
    const res = await app.inject({ method: 'GET', url: feedPath((await connect(auth)).feedUrl) });
    const evs = events(res.body);
    expect(evs).toHaveLength(2);
    expect(evs.filter((e) => e.rrule?.options.until)).toHaveLength(1);
  });

  it('regenerating invalidates the old URL, disconnecting invalidates the new one', async () => {
    const { auth } = await registerUser(app);
    const first = feedPath((await connect(auth)).feedUrl);
    const second = feedPath((await connect(auth)).feedUrl);

    expect((await app.inject({ method: 'GET', url: first })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: second })).statusCode).toBe(200);

    const del = await app.inject({ method: 'DELETE', url: '/api/calendar/token', headers: auth });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: second })).statusCode).toBe(404);
    const settings = await app.inject({ method: 'GET', url: '/api/settings', headers: auth });
    expect(settings.json()).toMatchObject({ calendarConnected: false, calendarConnectedAt: null });
  });

  it.each([
    '/api/calendar/feed/mygym_cal_nothex.ics',
    `/api/calendar/feed/mygym_cal_${'a'.repeat(64)}.ics`,
    `/api/calendar/feed/mygym_cal_${'a'.repeat(64)}`,
  ])('returns 404 for %s', async (url) => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(404);
  });

  it('serves each user only their own schedule', async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    await app.inject({ method: 'PATCH', url: '/api/settings', headers: alice.auth, payload: { trainingDays: [1] } });
    await app.inject({ method: 'PATCH', url: '/api/settings', headers: bob.auth, payload: { trainingDays: [7] } });

    const aliceFeed = await app.inject({ method: 'GET', url: feedPath((await connect(alice.auth)).feedUrl) });
    const bobFeed = await app.inject({ method: 'GET', url: feedPath((await connect(bob.auth)).feedUrl) });

    expect(aliceFeed.body).toContain(alice.user.id);
    expect(aliceFeed.body).not.toContain(bob.user.id);
    expect(bobFeed.body).toContain(bob.user.id);
    expect(bobFeed.body).not.toContain(alice.user.id);
  });

  it('rate-limits the feed per file, not per client', async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const alicePath = feedPath((await connect(alice.auth)).feedUrl);
    const bobPath = feedPath((await connect(bob.auth)).feedUrl);

    for (let i = 0; i < 60; i++) {
      expect((await app.inject({ method: 'GET', url: alicePath })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'GET', url: alicePath })).statusCode).toBe(429);
    // Same client address, another feed - Google fetches every feed from shared IPs.
    expect((await app.inject({ method: 'GET', url: bobPath })).statusCode).toBe(200);
  });

  it('falls back to English for an unknown lang', async () => {
    const { auth } = await registerUser(app);
    const path = feedPath((await connect(auth)).feedUrl).replace('lang=en', 'lang=de');
    const res = await app.inject({ method: 'GET', url: path });
    expect(res.statusCode).toBe(200);
    expect(events(res.body)[0].summary).toBe('Workout');
  });
});
