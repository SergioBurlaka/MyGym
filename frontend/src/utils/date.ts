// Calendar dates ('YYYY-MM-DD') in the user's LOCAL time zone. Never via
// toISOString(): that's UTC, so in Kyiv from 00:00 to 02:00 (03:00 in
// summer) "today" came out as yesterday.

export type MonthRef = { year: number; month: number }; // month 0-11

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIso(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Local midnight of that day.
export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayIso(now: Date = new Date()): string {
  return toIso(now);
}

// Via the Date constructor, not +24h: a DST day is 23 or 25 hours long.
export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  return toIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

export function addMonths({ year, month }: MonthRef, months: number): MonthRef {
  const total = year * 12 + month + months;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

// 0 = Monday ... 6 = Sunday.
export function weekdayMonday(iso: string): number {
  return (parseIso(iso).getDay() + 6) % 7;
}

export function startOfWeekMonday(iso: string): string {
  return addDays(iso, -weekdayMonday(iso));
}

export function monthOf(iso: string): MonthRef {
  const d = parseIso(iso);
  return { year: d.getFullYear(), month: d.getMonth() };
}

// The 6 x 7 days shown for a month, starting on the Monday on or before the 1st.
export function monthGrid({ year, month }: MonthRef): string[] {
  const start = startOfWeekMonday(toIso(new Date(year, month, 1)));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

// Keeps the day of month where it can: 31 Jan + 1 month = 28/29 Feb.
export function shiftMonthKeepDay(iso: string, months: number): string {
  const d = parseIso(iso);
  const target = addMonths({ year: d.getFullYear(), month: d.getMonth() }, months);
  const lastDay = new Date(target.year, target.month + 1, 0).getDate();
  return toIso(new Date(target.year, target.month, Math.min(d.getDate(), lastDay)));
}
