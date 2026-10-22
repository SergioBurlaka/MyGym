import ical, { ICalAlarmType } from 'ical-generator';
import { getVtimezoneComponent } from '@touch4it/ical-timezones';
import { DateTime } from 'luxon';

export type FeedLang = 'en' | 'uk';

export type ScheduleRow = { trainingDays: number[]; effectiveFrom: string };

export type FeedInput = {
  userId: string;
  history: ScheduleRow[]; // oldest first
  trainingTime: string; // "HH:MM"
  trainingDurationMin: number;
  timezone: string;
  lang: FeedLang;
  appUrl: string;
};

const SUMMARY: Record<FeedLang, string> = { en: 'Workout', uk: 'Тренування' };
const ICAL_WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']; // ISO 1..7
const REMINDER_SECONDS = 30 * 60;
const REFRESH_SECONDS = 6 * 60 * 60;

// @touch4it/ical-timezones predates some IANA renames and only knows the old
// name of a few zones. The alias is used for TZID and VTIMEZONE alike, so the
// two always match.
const VTIMEZONE_ALIASES: Record<string, string> = { 'Europe/Kyiv': 'Europe/Kiev' };

function resolveTzid(tz: string): { tzid: string; hasVtimezone: boolean } {
  // The package's Etc/GMT±N data has the POSIX sign the wrong way round
  // (Etc/GMT+5 comes out as +05:00, it is UTC-5) - a client trusting that
  // VTIMEZONE would move every event by 2N hours. Bare TZID instead.
  if (tz.startsWith('Etc/')) return { tzid: tz, hasVtimezone: false };
  for (const candidate of [tz, VTIMEZONE_ALIASES[tz]]) {
    if (candidate && getVtimezoneComponent(candidate)) return { tzid: candidate, hasVtimezone: true };
  }
  // Unknown to the package: clients (Google, Apple, Outlook) still resolve a
  // plain IANA name in TZID, the feed is just less strictly RFC 5545.
  return { tzid: tz, hasVtimezone: false };
}

// First training day on or after `from` (ISO weekdays `days`) on which the
// wall clock actually shows `hour:minute`. DTSTART fixes the wall time for the
// whole RRULE, so a start inside a spring-forward gap (Luxon moves 03:30 to
// 04:30) would shift every later event too - such a day is skipped.
function firstStart(from: DateTime, days: number[], hour: number, minute: number): DateTime {
  let date = from;
  for (;;) {
    if (days.includes(date.weekday)) {
      const start = date.set({ hour, minute });
      if (start.hour === hour && start.minute === minute) return start;
    }
    date = date.plus({ days: 1 });
  }
}

// One weekly series per schedule history row, so past weeks show the schedule
// that was in effect then. Time and duration are the current ones for every
// series - their history isn't kept.
//
// Dates are Luxon DateTimes in the user's zone on purpose: ical-generator
// renders a native Date with the server process's local clock, which in a
// UTC container would shift every workout by the zone's offset.
export function buildCalendarFeed(input: FeedInput): string {
  const { tzid, hasVtimezone } = resolveTzid(input.timezone);
  const zone = input.timezone;
  const [hour, minute] = input.trainingTime.split(':').map(Number);

  const calendar = ical({
    name: 'MyGym',
    prodId: { company: 'MyGym', product: 'training-schedule', language: input.lang.toUpperCase() },
    ttl: REFRESH_SECONDS,
    // name: null keeps DTSTAMP in UTC; the generator only adds VTIMEZONE.
    timezone: hasVtimezone ? { name: null, generator: getVtimezoneComponent } : undefined,
  });

  input.history.forEach((row, i) => {
    if (row.trainingDays.length === 0) return;
    const next = input.history[i + 1];
    const nextFrom = next ? DateTime.fromISO(next.effectiveFrom, { zone }) : null;
    const start = firstStart(DateTime.fromISO(row.effectiveFrom, { zone }), row.trainingDays, hour, minute);
    // Schedule replaced before its first training day - nothing to show.
    if (nextFrom && start >= nextFrom) return;

    let rrule = `FREQ=WEEKLY;BYDAY=${row.trainingDays.map((d) => ICAL_WEEKDAYS[d - 1]).join(',')}`;
    if (nextFrom) {
      // Last second of the day before the next schedule takes over (RFC 5545:
      // UNTIL is UTC when DTSTART has a TZID).
      rrule += `;UNTIL=${nextFrom.minus({ seconds: 1 }).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'")}`;
    }

    calendar.createEvent({
      // Stable per history row, so a refresh updates events instead of duplicating them.
      id: `schedule-${row.effectiveFrom}-${input.userId}@mygym`,
      start,
      end: start.plus({ minutes: input.trainingDurationMin }),
      timezone: tzid,
      summary: SUMMARY[input.lang],
      description: input.appUrl,
      url: input.appUrl,
      repeating: rrule,
      alarms: [{ type: ICalAlarmType.display, trigger: REMINDER_SECONDS }],
    });
  });

  return calendar.toString();
}
