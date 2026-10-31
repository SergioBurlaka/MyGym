import { describe, expect, it } from 'vitest';
import { calendarWeeks, historyStart, MAX_WEEKS, MIN_WEEKS, monthLabels } from './consistencyCalendar.js';

describe('historyStart', () => {
  it('takes a workout older than the schedule history (CSV import after registration)', () => {
    expect(historyStart('2026-07-01', '2026-10-25')).toBe('2026-07-01');
  });
  it('takes the schedule when it is older than the first workout', () => {
    expect(historyStart('2026-10-01', '2026-09-15')).toBe('2026-09-15');
  });
  it('falls back to whichever exists', () => {
    expect(historyStart(null, '2026-10-25')).toBe('2026-10-25');
    expect(historyStart('2026-07-01', null)).toBe('2026-07-01');
    expect(historyStart(null, null)).toBeNull();
  });
});

describe('calendarWeeks', () => {
  // Sat 31 Oct 2026; its Monday is 26 Oct.
  const today = '2026-10-31';

  it('runs from the Monday of the first workout week to this week', () => {
    const weeks = calendarWeeks('2026-07-01', today); // Wed -> Mon 29 Jun
    expect(weeks[0]).toBe('2026-06-29');
    expect(weeks[weeks.length - 1]).toBe('2026-10-26');
    expect(weeks.length).toBe(18);
  });

  it('never shows fewer than MIN_WEEKS', () => {
    expect(calendarWeeks('2026-10-25', today).length).toBe(MIN_WEEKS);
    expect(calendarWeeks(null, today).length).toBe(MIN_WEEKS);
  });

  it("caps a typo'd ancient date at MAX_WEEKS", () => {
    const weeks = calendarWeeks('2006-07-01', today);
    expect(weeks.length).toBe(MAX_WEEKS);
    expect(weeks[weeks.length - 1]).toBe('2026-10-26');
  });

  it('ends on the current week even when today is Monday', () => {
    const weeks = calendarWeeks('2026-01-05', '2026-10-26');
    expect(weeks[weeks.length - 1]).toBe('2026-10-26');
    expect(weeks[0]).toBe('2026-01-05');
  });
});

describe('monthLabels', () => {
  const mondays = ['2026-06-29', '2026-07-06', '2026-07-27', '2026-08-03', '2026-08-10'];

  it('labels each column starting a new month', () => {
    const later = ['2026-06-22', '2026-06-29', '2026-07-06', '2026-07-13', '2026-08-03'];
    expect(monthLabels(later, 'uk')).toEqual(['черв.', '', 'лип.', '', 'серп.']);
  });

  it('drops the first label when the next month starts in the second column (no overlap)', () => {
    expect(monthLabels(mondays, 'uk')).toEqual(['', 'лип.', '', 'серп.', '']);
  });

  it('follows the UI language', () => {
    expect(monthLabels(mondays, 'en')).toEqual(['', 'Jul', '', 'Aug', '']);
  });
});
