import { addDays, parseIso, startOfWeekMonday } from './date.js';

// The consistency calendar shows every week from the start of the user's
// history to the current one - but never fewer than this, so a new account
// still gets a calendar-shaped grid.
export const MIN_WEEKS = 16;

// The start of history is the earliest of the first workout and the first
// schedule entry. The schedule alone is not enough: workouts imported from CSV
// after registration are older than the schedule history.
export function historyStart(firstWorkout: string | null, firstSchedule: string | null): string | null {
  if (firstWorkout && firstSchedule) return firstWorkout < firstSchedule ? firstWorkout : firstSchedule;
  return firstWorkout ?? firstSchedule;
}

// Mondays of every column, oldest first: from the week of `start` to the week
// of `today`, padded on the left to MIN_WEEKS.
export function calendarWeeks(start: string | null, today: string): string[] {
  const lastMonday = startOfWeekMonday(today);
  const minFirst = addDays(lastMonday, -7 * (MIN_WEEKS - 1));
  const startMonday = start ? startOfWeekMonday(start) : minFirst;
  const first = startMonday < minFirst ? startMonday : minFirst;
  const weeks: string[] = [];
  for (let m = first; m <= lastMonday; m = addDays(m, 7)) weeks.push(m);
  return weeks;
}

// A short month name over the first column whose Monday falls in a new month
// (and over the first column), e.g. «лип.» / "Jul".
export function monthLabels(mondays: string[], lang: string): string[] {
  const fmt = new Intl.DateTimeFormat(lang, { month: 'short' });
  return mondays.map((m, i) => {
    const month = parseIso(m).getMonth();
    if (i > 0 && parseIso(mondays[i - 1]).getMonth() === month) return '';
    return fmt.format(parseIso(m));
  });
}
