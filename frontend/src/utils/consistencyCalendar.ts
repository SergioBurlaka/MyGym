import { addDays, parseIso, startOfWeekMonday } from './date.js';

// The consistency calendar shows every week from the start of the user's
// history to the current one - no empty weeks before it. A short history is
// stretched over the card (cells up to 18 px), a long one scrolls at 14 px.
// Never more than ~5 years.
export const MAX_WEEKS = 53 * 5;

// The start of history is the earliest of the first workout and the first
// schedule entry. The schedule alone is not enough: workouts imported from CSV
// after registration are older than the schedule history.
export function historyStart(firstWorkout: string | null, firstSchedule: string | null): string | null {
  if (firstWorkout && firstSchedule) return firstWorkout < firstSchedule ? firstWorkout : firstSchedule;
  return firstWorkout ?? firstSchedule;
}

// Mondays of every column, oldest first: from the week of `start` to the
// week of `today`. Without any history - just the current week.
export function calendarWeeks(start: string | null, today: string): string[] {
  const lastMonday = startOfWeekMonday(today);
  const maxFirst = addDays(lastMonday, -7 * (MAX_WEEKS - 1));
  let first = start ? startOfWeekMonday(start) : lastMonday;
  // A typo'd year (2006 for 2026, via CSV or MCP) must not render 1000 weeks.
  if (first < maxFirst) first = maxFirst;
  if (first > lastMonday) first = lastMonday;
  const weeks: string[] = [];
  for (let m = first; m <= lastMonday; m = addDays(m, 7)) weeks.push(m);
  return weeks;
}

// A short month name over the first column whose Monday falls in a new month
// (and over the first column), e.g. «лип.» / "Jul". A label (~30 px) is wider
// than two 14 px columns, so the first column's label is dropped when the next
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
