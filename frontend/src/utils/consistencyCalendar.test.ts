import { describe, expect, it } from 'vitest';
import { calendarWeeks, historyStart, MAX_WEEKS, monthLabels } from './consistencyCalendar.js';

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
    const weeks = calendarWeeks('2025-07-02', today); // Wed -> Mon 30 Jun 2025
    expect(weeks[0]).toBe('2025-06-30');
    expect(weeks[weeks.length - 1]).toBe('2026-10-26');
    expect(weeks.length).toBe(70);
  });

  it('has no empty weeks before a short history', () => {
    const short = calendarWeeks('2026-07-01', today); // Wed -> Mon 29 Jun
    expect(short.length).toBe(18);
    expect(short[0]).toBe('2026-06-29');
    expect(calendarWeeks('2026-10-25', today)).toEqual(['2026-10-19', '2026-10-26']);
  });

  it('is just the current week without history (or with a start in the future)', () => {
    expect(calendarWeeks(null, today)).toEqual(['2026-10-26']);
    expect(calendarWeeks('2026-11-20', today)).toEqual(['2026-10-26']);
  });

  it("caps a typo'd ancient date at MAX_WEEKS", () => {
    const weeks = calendarWeeks('2006-07-01', today);
    expect(weeks.length).toBe(MAX_WEEKS);
    expect(weeks[weeks.length - 1]).toBe('2026-10-26');
  });

  it('ends on the current week even when today is Monday', () => {
    const weeks = calendarWeeks('2025-01-06', '2026-10-26');
    expect(weeks[weeks.length - 1]).toBe('2026-10-26');
    expect(weeks[0]).toBe('2025-01-06');
  });
});

describe('monthLabels', () => {
  const mondays = ['2026-06-29', '2026-07-06', '2026-07-27', '2026-08-03', '2026-08-10'];

  it('labels each column starting a new month', () => {
    const later = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-07-06', '2026-08-03'];
    expect(monthLabels(later, 'uk')).toEqual(['черв.', '', '', '', 'лип.', 'серп.']);
  });

  it('drops the first label when the next month starts in the second column (no overlap)', () => {
    expect(monthLabels(mondays, 'uk')).toEqual(['', 'лип.', '', 'серп.', '']);
  });

  it('drops the first label when the next month starts in the third column too', () => {
    const third = ['2026-06-22', '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20'];
    expect(monthLabels(third, 'uk')).toEqual(['', '', 'лип.', '', '']);
  });

  it('keeps the first label when the next month is four columns away', () => {
    const fourth = ['2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29', '2026-07-06'];
    expect(monthLabels(fourth, 'uk')).toEqual(['черв.', '', '', '', 'лип.']);
  });

  it('follows the UI language', () => {
    expect(monthLabels(mondays, 'en')).toEqual(['', 'Jul', '', 'Aug', '']);
  });
});
