import { addDays, parseIso, startOfWeekMonday } from './date.js';

// The consistency calendar shows every week from the start of the user's
// history to the current one - but never fewer than a year (as GitHub does):
// on a phone that is always wider than the screen, so the grid scrolls.
export const MIN_WEEKS = 52;
// A column is a 14 px cell plus the 3 px gap.
export const COLUMN_PX = 17;
const GAP_PX = 3;
// ...and never more than ~5 years.
export const MAX_WEEKS = 53 * 5;

// The start of history is the earliest of the first workout and the first
// schedule entry. The schedule alone is not enough: workouts imported from CSV
// after registration are older than the schedule history.
export function historyStart(firstWorkout: string | null, firstSchedule: string | null): string | null {
  if (firstWorkout && firstSchedule) return firstWorkout < firstSchedule ? firstWorkout : firstSchedule;
  return firstWorkout ?? firstSchedule;
}

// How many whole columns fit into a scroll area this wide (n columns take
// n * 17 - 3 px: no gap after the last one).
export function fitWeeks(clientWidth: number): number {
  return Math.max(0, Math.floor((clientWidth + GAP_PX) / COLUMN_PX));
}

// Mondays of every column, oldest first: from the week of `start` to the week
// of `today`, padded on the left to MIN_WEEKS and to `fit` - the columns that
// fit into the area, so a wide screen has no empty space on the right. The
// padded weeks before `start` are rendered muted.
export function calendarWeeks(start: string | null, today: string, fit = 0): string[] {
  const lastMonday = startOfWeekMonday(today);
  const minCount = Math.min(Math.max(MIN_WEEKS, fit), MAX_WEEKS);
  const minFirst = addDays(lastMonday, -7 * (minCount - 1));
  const maxFirst = addDays(lastMonday, -7 * (MAX_WEEKS - 1));
  let startMonday = start ? startOfWeekMonday(start) : minFirst;
  // A typo'd year (2006 for 2026, via CSV or MCP) must not render 1000 weeks.
  if (startMonday < maxFirst) startMonday = maxFirst;
  const first = startMonday < minFirst ? startMonday : minFirst;
  const weeks: string[] = [];
  for (let m = first; m <= lastMonday; m = addDays(m, 7)) weeks.push(m);
  return weeks;
}

// A short month name over the first column whose Monday falls in a new month
// (and over the first column), e.g. «лип.» / "Jul". A label (~30 px) is wider
// than two 17 px columns, so the first column's label is dropped when the next
// month starts in the second or third column - they would run into each other.
// Later labels are a whole month (4+ columns) apart.
export function monthLabels(mondays: string[], lang: string): string[] {
  const fmt = new Intl.DateTimeFormat(lang, { month: 'short' });
  const labels = mondays.map((m, i) => {
    const month = parseIso(m).getMonth();
    if (i > 0 && parseIso(mondays[i - 1]).getMonth() === month) return '';
    return fmt.format(parseIso(m));
  });
  if (labels[1] || labels[2]) labels[0] = '';
  return labels;
}
