import { describe, expect, it } from 'vitest';
import { fillWeeks, niceMax, repsMax, weekAverage } from './weeklyVolume.js';

const week = (weekStart: string, large = 0, bodyweight = 0) => ({ weekStart, large, small: 0, bodyweight });

describe('fillWeeks', () => {
  it('fills the weeks off with zeros and runs to the current week', () => {
    // Sat 31 Oct 2026 -> current week starts Mon 26 Oct.
    const weeks = fillWeeks([week('2026-10-05', 100), week('2026-10-19', 200)], '2026-10-31');
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(weeks.map((w) => w.large)).toEqual([100, 0, 200, 0]);
  });

  it('is empty without data', () => {
    expect(fillWeeks([], '2026-10-31')).toEqual([]);
  });

  it('caps an ancient first week at ~5 years', () => {
    const weeks = fillWeeks([week('2006-07-03', 1)], '2026-10-31');
    expect(weeks).toHaveLength(53 * 5);
    expect(weeks[weeks.length - 1].weekStart).toBe('2026-10-26');
  });
});

describe('niceMax', () => {
  it('rounds up to three nice steps', () => {
    expect(niceMax(16072)).toBe(18000);
    expect(niceMax(15000)).toBe(15000);
    expect(niceMax(800)).toBe(900);
    expect(niceMax(0)).toBe(3);
  });
});

describe('weekAverage', () => {
  const series = (values: number[]) => values.map((v, i) => week(`w${String(i).padStart(2, '0')}`, v));

  it('averages over the weeks up to the selected one when the history is shorter', () => {
    expect(weekAverage(series([100, 200, 300]), 2, 'large')).toBe(200);
    expect(weekAverage(series([100, 200, 300]), 0, 'large')).toBe(100);
  });

  it('counts the weeks off as zeros', () => {
    expect(weekAverage(series([300, 0, 0]), 2, 'large')).toBe(100);
  });

  it('takes the 12 weeks up to and including the selected one', () => {
    // 13 weeks: the first (1300) falls out of the window of the last week.
    const weeks = series([1300, ...Array<number>(12).fill(120)]);
    expect(weekAverage(weeks, 12, 'large')).toBe(120);
    expect(weekAverage(weeks, 11, 'large')).toBe((1300 + 11 * 120) / 12);
  });

  it('works per series', () => {
    expect(weekAverage([week('a', 0, 10), week('b', 0, 30)], 1, 'bodyweight')).toBe(20);
  });
});

describe('repsMax', () => {
  it('rounds the reps scale up to 50', () => {
    expect(repsMax(121)).toBe(150);
    expect(repsMax(300)).toBe(300);
    expect(repsMax(1)).toBe(50);
    expect(repsMax(0)).toBe(50);
  });
});
