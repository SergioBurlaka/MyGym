import type { WeeklyCategoryVolume } from '../types/index.js';
import { addDays, startOfWeekMonday } from './date.js';
import { MAX_WEEKS } from './consistencyCalendar.js';

// Every week from the first one with a workout to the current one, oldest
// first. The API only returns weeks that have sets, so the gaps (a week off)
// become zero groups - otherwise the strip would silently skip them. Capped
// at the same ~5 years as the consistency calendar.
export function fillWeeks(data: WeeklyCategoryVolume[], today: string): WeeklyCategoryVolume[] {
  if (data.length === 0) return [];
  const byWeek = new Map(data.map((w) => [w.weekStart, w]));
  const last = startOfWeekMonday(today);
  const capFirst = addDays(last, -7 * (MAX_WEEKS - 1));
  let first = data[0].weekStart < capFirst ? capFirst : data[0].weekStart;
  if (first > last) first = last;
  const weeks: WeeklyCategoryVolume[] = [];
  for (let w = first; w <= last; w = addDays(w, 7)) {
    weeks.push(byWeek.get(w) ?? { weekStart: w, large: 0, small: 0, bodyweight: 0 });
  }
  return weeks;
}

const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

// A round top of the Y scale with three equal steps under it (e.g. 16 072 ->
// 18 000: 6 t / 12 t / 18 t). One scale for the whole history, so the bars
// don't change size while scrolling.
export function niceMax(max: number): number {
  if (max <= 0) return 3;
  const step = max / 3;
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const nice = NICE_STEPS.find((s) => s * magnitude >= step) ?? 10;
  return nice * magnitude * 3;
}
