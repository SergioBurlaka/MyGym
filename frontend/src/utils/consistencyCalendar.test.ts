import { describe, expect, it } from 'vitest';
import { calendarWeeks, fitWeeks, historyColumn, historyStart, MAX_WEEKS, MIN_WEEKS, monthLabels } from './consistencyCalendar.js';

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

  it('runs from the Monday of the first workout week to this week when history is longer than a year', () => {
    const weeks = calendarWeeks('2025-07-02', today); // Wed -> Mon 30 Jun 2025
    expect(weeks[0]).toBe('2025-06-30');
    expect(weeks[weeks.length - 1]).toBe('2026-10-26');
    expect(weeks.length).toBe(70);
  });

  it('never shows fewer than a year (MIN_WEEKS = 52)', () => {
    expect(MIN_WEEKS).toBe(52);
    const short = calendarWeeks('2026-07-01', today); // 18 weeks of history
    expect(short.length).toBe(52);
    expect(short[short.length - 1]).toBe('2026-10-26');
    expect(calendarWeeks('2026-10-25', today).length).toBe(52);
    expect(calendarWeeks(null, today).length).toBe(52);
  });

  it('pads on the left to the columns that fit into the area', () => {
    const weeks = calendarWeeks('2026-07-01', today, 70);
    expect(weeks.length).toBe(70);
    expect(weeks[weeks.length - 1]).toBe('2026-10-26');
    expect(calendarWeeks(null, today, 60).length).toBe(60);
  });

  it('ignores a fit smaller than the history or a year', () => {
    expect(calendarWeeks('2026-07-01', today, 20).length).toBe(52);
    expect(calendarWeeks('2025-07-02', today, 60).length).toBe(70);
  });

  it('never pads beyond MAX_WEEKS', () => {
    expect(calendarWeeks(null, today, 10_000).length).toBe(MAX_WEEKS);
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

describe('fitWeeks', () => {
  // n columns take n * 17 - 3 px (14 px cell, 3 px gap between).
  it('counts whole columns, no gap after the last one', () => {
    expect(fitWeeks(14)).toBe(1);
    expect(fitWeeks(13)).toBe(0);
    expect(fitWeeks(52 * 17 - 3)).toBe(52);
    expect(fitWeeks(52 * 17 - 4)).toBe(51);
    expect(fitWeeks(0)).toBe(0);
  });
});

describe('historyColumn', () => {
  const today = '2026-10-31';

  it('points at the week of the history start, after the padding', () => {
    const weeks = calendarWeeks('2026-07-01', today); // 52 columns, 18 of history
    expect(historyColumn(weeks, '2026-07-01')).toBe(52 - 18);
    expect(weeks[52 - 18]).toBe('2026-06-29');
  });

  it('is the first column when the start was capped by MAX_WEEKS', () => {
    expect(historyColumn(calendarWeeks('2006-07-01', today), '2006-07-01')).toBe(0);
  });

  it('is -1 without history', () => {
    expect(historyColumn(calendarWeeks(null, today), null)).toBe(-1);
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
