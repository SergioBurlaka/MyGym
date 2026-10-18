import { describe, expect, it } from 'vitest';
import {
  buildHistoryPoints,
  findLastProgress,
  suggestProgression,
  type HistoryPoint,
  type HistoryRow,
} from '../src/modules/progression/progression.service.js';

// One logged workout: weight per side + the reps of each set.
function session(date: string, weightPerUnitKg: number | null, reps: number[]): HistoryRow[] {
  return reps.map((r) => ({
    date,
    weightPerUnitKg: weightPerUnitKg == null ? null : String(weightPerUnitKg),
    weightUnits: weightPerUnitKg == null ? null : 2,
    reps: r,
  }));
}

const NOW = new Date('2026-10-19T12:00:00Z');

function suggest(history: HistoryPoint[], over: Partial<Parameters<typeof suggestProgression>[0]> = {}) {
  return suggestProgression({
    history,
    category: 'large',
    repRangeMax: 15,
    tryMoreAfterWorkouts: null,
    now: NOW,
    ...over,
  });
}

describe('buildHistoryPoints', () => {
  it('groups sets by workout date and computes the session stats', () => {
    const [point] = buildHistoryPoints(session('2026-10-01', 20, [10, 8, 6]));
    expect(point).toMatchObject({
      date: '2026-10-01',
      totalWeightKg: 40, // 20 kg per side x 2
      maxReps: 10,
      totalReps: 24,
      avgReps: 8,
      setsCount: 3,
      volumeKg: 960, // 40 kg x 24 reps
      estimatedOneRepMaxKg: 53.3, // Epley: 40 x (1 + 10/30), rounded to 0.1
    });
  });

  it('returns points in chronological order even if rows arrive unsorted', () => {
    const points = buildHistoryPoints([...session('2026-10-05', 20, [10]), ...session('2026-10-01', 20, [8])]);
    expect(points.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-05']);
  });

  it('has no weight-based metrics for a bodyweight exercise', () => {
    const [point] = buildHistoryPoints(session('2026-10-01', null, [20, 18]));
    expect(point.totalWeightKg).toBeNull();
    expect(point.volumeKg).toBeNull();
    expect(point.estimatedOneRepMaxKg).toBeNull();
    expect(point.totalReps).toBe(38);
  });

  it('flags personal records only when strictly better than every earlier session', () => {
    const points = buildHistoryPoints([
      ...session('2026-10-01', 20, [10]),
      ...session('2026-10-03', 20, [10]), // same - not a PR
      ...session('2026-10-05', 22.5, [8]), // heavier - weight PR only
      ...session('2026-10-07', 20, [12]), // more reps - reps PR only
    ]);
    expect(points.map((p) => [p.isWeightPR, p.isRepsPR])).toEqual([
      [true, true],
      [false, false],
      [true, false],
      [false, true],
    ]);
  });
});

describe('findLastProgress', () => {
  it('is the latest session that beat the one before it on weight or reps', () => {
    const history = buildHistoryPoints([
      ...session('2026-10-01', 20, [8]),
      ...session('2026-10-03', 20, [9]), // progress (reps)
      ...session('2026-10-05', 20, [9]),
      ...session('2026-10-07', 20, [7]),
    ]);
    expect(findLastProgress(history)).toEqual({ date: '2026-10-03', sessionsSince: 2 });
  });

  it('falls back to the first session when nothing ever improved', () => {
    const history = buildHistoryPoints([...session('2026-10-01', 20, [8]), ...session('2026-10-03', 20, [8])]);
    expect(findLastProgress(history)).toEqual({ date: '2026-10-01', sessionsSince: 1 });
  });

  it('is null for an empty history', () => {
    expect(findLastProgress([])).toBeNull();
  });
});

describe('suggestProgression', () => {
  it('increase_weight once the top of the rep range is reached', () => {
    const history = buildHistoryPoints(session('2026-10-18', 20, [15, 15, 15]));
    expect(suggest(history).suggestion).toBe('increase_weight');
  });

  it('start_adding_weight for a bodyweight exercise maxed out without weight', () => {
    const history = buildHistoryPoints(session('2026-10-18', null, [30, 30]));
    expect(suggest(history, { category: 'bodyweight', repRangeMax: 30 }).suggestion).toBe('start_adding_weight');
  });

  it('increase_weight (not start_adding) for a bodyweight exercise already done with weight', () => {
    const history = buildHistoryPoints(session('2026-10-18', 5, [30]));
    expect(suggest(history, { category: 'bodyweight', repRangeMax: 30 }).suggestion).toBe('increase_weight');
  });

  it('try_more after 14 days without progress', () => {
    const history = buildHistoryPoints([
      ...session('2026-10-01', 20, [10]),
      ...session('2026-10-10', 20, [10]),
      ...session('2026-10-18', 20, [10]),
    ]);
    const result = suggest(history);
    expect(result.daysSinceProgress).toBe(18);
    expect(result.suggestion).toBe('try_more');
  });

  it('ok when progress was recent', () => {
    const history = buildHistoryPoints([...session('2026-10-01', 20, [10]), ...session('2026-10-15', 20, [11])]);
    const result = suggest(history);
    expect(result.daysSinceProgress).toBe(4);
    expect(result.daysSinceLastWorkout).toBe(4);
    expect(result.suggestion).toBe('ok');
  });

  it("uses the program's workout-count rule instead of days when it is set", () => {
    // 13 days, so the day rule alone would say "ok" - but 3 stalled sessions
    // reach the program's threshold of 3.
    const history = buildHistoryPoints([
      ...session('2026-10-06', 20, [10]),
      ...session('2026-10-10', 20, [10]),
      ...session('2026-10-14', 20, [10]),
      ...session('2026-10-18', 20, [10]),
    ]);
    expect(suggest(history).suggestion).toBe('ok');
    expect(suggest(history, { tryMoreAfterWorkouts: 3 }).suggestion).toBe('try_more');
    expect(suggest(history, { tryMoreAfterWorkouts: 4 }).suggestion).toBe('ok');
  });

  it('a maxed-out set beats the stall reminder', () => {
    const history = buildHistoryPoints([...session('2026-09-01', 20, [15]), ...session('2026-10-18', 20, [15])]);
    expect(suggest(history).suggestion).toBe('increase_weight');
  });
});
