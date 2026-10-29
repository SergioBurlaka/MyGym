import { describe, expect, it } from 'vitest';
import { addDays, addMonths, monthGrid, shiftMonthKeepDay, startOfWeekMonday, todayIso, weekdayMonday } from './date.js';

// Runs in Europe/Kyiv (vitest.config.ts).

describe('todayIso', () => {
  it('is the local date, not UTC, just after midnight', () => {
    // 00:30 in Kyiv on 29 Oct 2026 (winter time, UTC+2) is still 28 Oct in UTC.
    const now = new Date('2026-10-28T22:30:00Z');
    expect(now.toISOString().slice(0, 10)).toBe('2026-10-28');
    expect(todayIso(now)).toBe('2026-10-29');
  });

  it('holds in summer time too (UTC+3)', () => {
    expect(todayIso(new Date('2026-07-14T21:30:00Z'))).toBe('2026-07-15');
  });
});

describe('monthGrid', () => {
  it('starts on the Monday on or before the 1st', () => {
    const grid = monthGrid({ year: 2026, month: 9 }); // October 2026: the 1st is a Thursday
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-09-28');
    expect(grid[3]).toBe('2026-10-01');
    expect(grid[41]).toBe('2026-11-08');
  });

  it('starts on the 1st itself when it is a Monday', () => {
    expect(monthGrid({ year: 2026, month: 5 })[0]).toBe('2026-06-01');
  });
});

describe('moving across months and years', () => {
  it('goes from December to January and back', () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2027, month: 0 }, -1)).toEqual({ year: 2026, month: 11 });
    expect(addMonths({ year: 2026, month: 9 }, -22)).toEqual({ year: 2024, month: 11 });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('counts calendar days over a DST change', () => {
    // Clocks go back on 25 Oct 2026 in Kyiv - that day is 25 hours long.
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });

  it('keeps the day of month when it can', () => {
    expect(shiftMonthKeepDay('2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftMonthKeepDay('2028-01-31', 1)).toBe('2028-02-29');
    expect(shiftMonthKeepDay('2026-10-29', 12)).toBe('2027-10-29');
  });
});

describe('weeks', () => {
  it('starts a week on Monday', () => {
    expect(weekdayMonday('2026-10-26')).toBe(0);
    expect(weekdayMonday('2026-11-01')).toBe(6);
    expect(startOfWeekMonday('2026-11-01')).toBe('2026-10-26');
  });
});
