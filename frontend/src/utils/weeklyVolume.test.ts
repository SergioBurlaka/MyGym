import { describe, expect, it } from 'vitest';
import { fillWeeks, niceMax } from './weeklyVolume.js';

const week = (weekStart: string, large = 0) => ({ weekStart, large, small: 0, bodyweight: 0 });

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
