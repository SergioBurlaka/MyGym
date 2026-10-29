import { describe, expect, it } from 'vitest';
import {
  applyCounterShift,
  buildHistoryPoints,
  effectiveTryMoreAfterWorkouts,
  findLastProgress,
  localDate,
  longestBreak,
  progressTimeline,
  sessionGuide,
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

const BARBELL = { equipment: 'barbell', unilateral: false } as const;

// One barbell workout: the bar, plates per side and the reps of each set.
function barbell(date: string, barKg: number, platesPerSideKg: number, reps: number[]): HistoryRow[] {
  return session(date, platesPerSideKg, reps).map((row) => ({ ...row, barKg: String(barKg) }));
}

const NOW = new Date('2026-10-19T12:00:00Z');

function suggest(history: HistoryPoint[], over: Partial<Parameters<typeof suggestProgression>[0]> = {}) {
  return suggestProgression({
    history,
    category: 'large',
    repRangeMax: 15,
    tryMoreAfterWorkouts: 4,
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

  it('adds the bar for a barbell and counts both sides of a unilateral exercise', () => {
    const [row] = buildHistoryPoints(barbell('2026-10-01', 20, 16.25, [12, 12, 12]), BARBELL);
    expect(row).toMatchObject({ totalWeightKg: 52.5, barKg: 20, addedLoadKg: 32.5, volumeKg: 1890 });

    const lunges = session('2026-10-01', 10, [13, 13, 13]);
    const [point] = buildHistoryPoints(lunges, { equipment: 'dumbbell', unilateral: true });
    expect(point).toMatchObject({ totalWeightKg: 20, maxReps: 13, totalReps: 78, volumeKg: 1560 });
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

  it('does not count a heavier bar with the same plates and reps as progress', () => {
    const history = buildHistoryPoints(
      [...barbell('2026-10-01', 15, 10, [10, 10]), ...barbell('2026-10-03', 20, 10, [10, 10])],
      BARBELL,
    );
    expect(findLastProgress(history)).toEqual({ date: '2026-10-01', sessionsSince: 1 });
  });

  it('judges reps on the previous bar after switching to a lighter one', () => {
    const history = buildHistoryPoints(
      [...barbell('2026-10-01', 20, 10, [10, 10]), ...barbell('2026-10-03', 15, 10, [10, 11])],
      BARBELL,
    );
    expect(findLastProgress(history)).toEqual({ date: '2026-10-03', sessionsSince: 0 });
  });

  it('counts more plates as progress whatever the bar', () => {
    const history = buildHistoryPoints(
      [...barbell('2026-10-01', 20, 10, [10]), ...barbell('2026-10-03', 15, 11.25, [8])],
      BARBELL,
    );
    expect(findLastProgress(history)).toEqual({ date: '2026-10-03', sessionsSince: 0 });
  });

  it('counts an added set as progress (more volume at the same weight)', () => {
    const history = buildHistoryPoints([
      ...session('2026-10-01', 20, [10, 10]),
      ...session('2026-10-03', 20, [10, 10, 8]), // progress (sets)
      ...session('2026-10-05', 20, [10, 10, 8]),
    ]);
    expect(findLastProgress(history)).toEqual({ date: '2026-10-03', sessionsSince: 1 });
  });

  it('counts a heavier weight as progress even when the volume drops', () => {
    const history = buildHistoryPoints([
      ...session('2026-10-01', 20, [12, 12, 12]), // 40 kg x 36 = 1440
      ...session('2026-10-03', 22.5, [8, 8, 8]), // 45 kg x 24 = 1080, but heavier
    ]);
    expect(findLastProgress(history)).toEqual({ date: '2026-10-03', sessionsSince: 0 });
  });

  it('does not count a higher top set when the total volume did not grow', () => {
    const history = buildHistoryPoints([
      ...session('2026-10-01', 20, [10, 10, 10]),
      ...session('2026-10-03', 20, [12, 9, 8]), // max reps up, total reps down
    ]);
    expect(findLastProgress(history)).toEqual({ date: '2026-10-01', sessionsSince: 1 });
  });

  it('uses total reps as the volume of a bodyweight exercise', () => {
    const history = buildHistoryPoints([
      ...session('2026-10-01', null, [20, 20]),
      ...session('2026-10-03', null, [20, 20, 15]), // progress (sets)
      ...session('2026-10-05', null, [20, 18]),
    ]);
    expect(findLastProgress(history)).toEqual({ date: '2026-10-03', sessionsSince: 1 });
  });

  it('treats a logged weight of 0 like no weight (total reps as volume)', () => {
    const history = buildHistoryPoints([...session('2026-10-01', 0, [20, 20]), ...session('2026-10-03', 0, [25, 25])]);
    expect(findLastProgress(history)).toEqual({ date: '2026-10-03', sessionsSince: 0 });
  });

  it('counts starting to add weight as progress, but not dropping it', () => {
    const history = buildHistoryPoints([
      ...session('2026-10-01', null, [30, 30, 30]),
      ...session('2026-10-03', 1.25, [10, 10, 10]), // progress: weight appeared, tiny kg volume
      ...session('2026-10-05', null, [30, 30, 30, 30]), // weight forgotten: reps vs kg not compared
    ]);
    expect(findLastProgress(history)).toEqual({ date: '2026-10-03', sessionsSince: 1 });
  });

  it('falls back to the first session when nothing ever improved', () => {
    const history = buildHistoryPoints([...session('2026-10-01', 20, [8]), ...session('2026-10-03', 20, [8])]);
    expect(findLastProgress(history)).toEqual({ date: '2026-10-01', sessionsSince: 1 });
  });

  it('is null for an empty history', () => {
    expect(findLastProgress([])).toBeNull();
  });
});

describe('progressTimeline', () => {
  it('freezes the counter at every session', () => {
    const history = buildHistoryPoints([
      ...session('2026-10-01', 20, [8, 8]),
      ...session('2026-10-03', 20, [8, 8, 8]), // progress (set)
      ...session('2026-10-05', 20, [8, 8, 8]),
      ...session('2026-10-08', 20, [8, 8, 8]),
      ...session('2026-10-10', 20, [15, 15, 15]), // progress, top of range
    ]);
    const points = progressTimeline(history, 15);
    expect(points.map((p) => [p.isFirst, p.isProgress, p.sessionsSinceProgress, p.daysSinceProgress])).toEqual([
      [true, false, 0, 0],
      [false, true, 0, 0],
      [false, false, 1, 2],
      [false, false, 2, 5],
      [false, true, 0, 0],
    ]);
    expect(points.map((p) => p.atTopOfRange)).toEqual([false, false, false, false, true]);
  });

  it('agrees with findLastProgress on the last session', () => {
    const history = buildHistoryPoints([
      ...session('2026-10-01', 20, [8]),
      ...session('2026-10-03', 20, [9]),
      ...session('2026-10-05', 20, [7]),
    ]);
    expect(progressTimeline(history, 15).at(-1)!.sessionsSinceProgress).toBe(findLastProgress(history)!.sessionsSince);
  });
});

describe('applyCounterShift', () => {
  const lastProgress = { date: '2026-10-03', sessionsSince: 4 };

  it('shifts the counter while the anchor is the last progress', () => {
    expect(applyCounterShift(lastProgress, { adjust: -2, anchor: '2026-10-03' })).toBe(2);
    expect(applyCounterShift(lastProgress, { adjust: 3, anchor: '2026-10-03' })).toBe(7);
  });

  it('never goes below zero', () => {
    expect(applyCounterShift(lastProgress, { adjust: -9, anchor: '2026-10-03' })).toBe(0);
  });

  it('lapses once a newer progress moved the anchor', () => {
    expect(applyCounterShift(lastProgress, { adjust: -2, anchor: '2026-09-20' })).toBe(4);
    expect(applyCounterShift(lastProgress, undefined)).toBe(4);
  });
});

describe('effectiveTryMoreAfterWorkouts', () => {
  it('uses the category default unless a program sets a value', () => {
    expect(effectiveTryMoreAfterWorkouts(null, 'large')).toBe(4);
    expect(effectiveTryMoreAfterWorkouts(undefined, 'small')).toBe(6);
    expect(effectiveTryMoreAfterWorkouts(null, 'bodyweight')).toBe(5);
    expect(effectiveTryMoreAfterWorkouts(0, 'large')).toBe(4);
    expect(effectiveTryMoreAfterWorkouts(2, 'small')).toBe(2);
  });
});

describe('training breaks', () => {
  // Same weight and reps every time - never progress.
  const flat = (dates: string[]) => buildHistoryPoints(dates.flatMap((d) => session(d, 20, [10])));

  it('longestBreak spans all workouts, not just this exercise', () => {
    expect(longestBreak(['2026-10-01', '2026-10-05', '2026-10-12'], '2026-10-01', '2026-10-12')).toBe(7);
    expect(longestBreak(['2026-10-01', '2026-10-12'], '2026-10-01', '2026-10-12')).toBe(11);
    // `to` counts even when it is not a workout date (today).
    expect(longestBreak(['2026-10-01'], '2026-10-01', '2026-10-20')).toBe(19);
  });

  it('the first session after a 10-13 day break does not add to the counter', () => {
    const dates = ['2026-10-01', '2026-10-03', '2026-10-15', '2026-10-17'];
    expect(findLastProgress(flat(dates))).toEqual({ date: '2026-10-01', sessionsSince: 3 });
    expect(findLastProgress(flat(dates), dates)).toEqual({ date: '2026-10-01', sessionsSince: 2 });
  });

  it('a 14+ day break restarts the counter from the first session back', () => {
    const dates = ['2026-09-01', '2026-09-03', '2026-09-05', '2026-09-25', '2026-09-27'];
    expect(findLastProgress(flat(dates), dates)).toEqual({ date: '2026-09-25', sessionsSince: 1 });
    const points = progressTimeline(flat(dates), 15, dates);
    expect(points.map((p) => p.afterBreak)).toEqual([false, false, false, true, false]);
    expect(points.map((p) => p.sessionsSinceProgress)).toEqual([0, 1, 2, 0, 1]);
  });

  it('a progress right after a break is still progress', () => {
    const history = buildHistoryPoints([...session('2026-09-01', 20, [10]), ...session('2026-09-25', 22.5, [10])]);
    const dates = ['2026-09-01', '2026-09-25'];
    expect(progressTimeline(history, 15, dates).at(-1)).toMatchObject({ isProgress: true, afterBreak: false });
  });

  it('a pending reset (break up to today) keeps a stable date that is no session', () => {
    const dates = ['2026-09-01', '2026-09-03'];
    const history = flat(dates);
    const day1 = findLastProgress(history, dates, '2026-09-20');
    const day2 = findLastProgress(history, dates, '2026-09-25');
    expect(day1).toEqual({ date: '2026-09-04', sessionsSince: 0 });
    expect(day2).toEqual(day1);
    // A shift anchored there survives the days passing; one set before the
    // break (anchored on a session date) lapses.
    expect(applyCounterShift(day2!, { adjust: 2, anchor: '2026-09-04' })).toBe(2);
    expect(applyCounterShift(day2!, { adjust: 2, anchor: '2026-09-01' })).toBe(0);
    // Under 14 days to today - no reset.
    expect(findLastProgress(history, dates, '2026-09-16')).toEqual({ date: '2026-09-01', sessionsSince: 1 });
  });

  it('localDate uses the user time zone', () => {
    const now = new Date('2026-10-23T22:30:00Z');
    expect(localDate(now, 'Europe/Kyiv')).toBe('2026-10-24');
    expect(localDate(now, 'UTC')).toBe('2026-10-23');
    expect(localDate(now, 'Not/AZone')).toBe('2026-10-23');
  });

  it('a gap for this exercise alone is not a break when the user kept training', () => {
    const history = flat(['2026-10-01', '2026-10-20']);
    const dates = ['2026-10-01', '2026-10-06', '2026-10-11', '2026-10-16', '2026-10-20'];
    expect(findLastProgress(history, dates)).toEqual({ date: '2026-10-01', sessionsSince: 1 });
  });
});

describe('suggestProgression', () => {
  it('a postponed counter holds off try_more', () => {
    const history = buildHistoryPoints([
      ...session('2026-10-01', 20, [8]),
      ...session('2026-10-03', 20, [8]),
      ...session('2026-10-05', 20, [8]),
    ]);
    const shifted = suggest(history, { tryMoreAfterWorkouts: 2, counterShift: { adjust: -1, anchor: '2026-10-01' } });
    expect(shifted).toMatchObject({ sessionsSinceProgress: 1, suggestion: 'ok' });
    expect(suggest(history, { tryMoreAfterWorkouts: 2 }).suggestion).toBe('try_more');
  });

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

  it('try_more after N sessions without progress, regardless of days', () => {
    const history = buildHistoryPoints([
      ...session('2026-10-06', 20, [10]),
      ...session('2026-10-10', 20, [10]),
      ...session('2026-10-14', 20, [10]),
      ...session('2026-10-18', 20, [10]),
    ]);
    expect(suggest(history, { tryMoreAfterWorkouts: 3 }).suggestion).toBe('try_more');
    expect(suggest(history, { tryMoreAfterWorkouts: 4 }).suggestion).toBe('ok');
  });

  it('ok when progress was recent', () => {
    const history = buildHistoryPoints([...session('2026-10-01', 20, [10]), ...session('2026-10-15', 20, [11])]);
    const result = suggest(history);
    expect(result.daysSinceProgress).toBe(4);
    expect(result.daysSinceLastWorkout).toBe(4);
    expect(result.sessionsSinceProgress).toBe(0);
    expect(result.suggestion).toBe('ok');
  });

  it('a 14+ day break since the last session resets the counter as of today', () => {
    const history = buildHistoryPoints([
      ...session('2026-09-20', 20, [10]),
      ...session('2026-09-22', 20, [10]),
      ...session('2026-09-24', 20, [10]),
      ...session('2026-09-26', 20, [10]),
      ...session('2026-09-28', 20, [10]),
    ]);
    const dates = ['2026-09-20', '2026-09-22', '2026-09-24', '2026-09-26', '2026-09-28'];
    expect(suggest(history).suggestion).toBe('try_more');
    expect(suggest(history, { workoutDates: dates })).toMatchObject({ sessionsSinceProgress: 0, suggestion: 'ok' });
    // Training other exercises in between means no break - the count stands.
    expect(suggest(history, { workoutDates: [...dates, '2026-10-08', '2026-10-17'] }).suggestion).toBe('try_more');
  });

  it('a maxed-out set beats the stall reminder', () => {
    const history = buildHistoryPoints([...session('2026-09-01', 20, [15]), ...session('2026-10-18', 20, [15])]);
    expect(suggest(history).suggestion).toBe('increase_weight');
  });
});

describe('sessionGuide', () => {
  const stalled = [
    ...session('2026-10-01', 10, [12, 12, 11]),
    ...session('2026-10-03', 10, [12, 12, 11]),
    ...session('2026-10-05', 10, [12, 12, 11]),
  ];
  function guide(rows: HistoryRow[], workoutDate: string, tryMoreAfterWorkouts = 2, counterShift?: { adjust: number; anchor: string | null }) {
    const history = buildHistoryPoints(rows);
    return sessionGuide(history, progressTimeline(history, 15), workoutDate, { tryMoreAfterWorkouts, counterShift });
  }

  it('is empty for an exercise never done before that date', () => {
    expect(guide(stalled, '2026-10-01')).toEqual({ previous: null, target: null, counterBefore: 0 });
  });

  it('gives last time before the workout, not the workout itself', () => {
    const { previous } = guide(stalled, '2026-10-05');
    expect(previous).toMatchObject({ date: '2026-10-03', reps: [12, 12, 11], weightPerUnitKg: 10, loadPerRepKg: 20 });
  });

  it('targets +1 in the weakest set once the counter reached try more', () => {
    // After 10-05 the counter stands at 2 (two sessions without progress).
    expect(guide(stalled, '2026-10-07').target).toEqual({ reps: [12, 12, 12], upSetIndex: 2 });
    expect(guide(stalled, '2026-10-07').counterBefore).toBe(2);
    // After 10-03 it was 1 - not yet.
    expect(guide(stalled, '2026-10-05').target).toBeNull();
  });

  it('counts the slider shift while it is anchored to that progress', () => {
    expect(guide(stalled, '2026-10-05', 2, { adjust: 1, anchor: '2026-10-01' }).target).not.toBeNull();
    expect(guide(stalled, '2026-10-05', 2, { adjust: 1, anchor: '2026-09-01' }).target).toBeNull();
  });

  it('applies the slider only for the latest session, not an older workout page', () => {
    // On 10-03's page the previous session is 10-01, but 10-05 came later -
    // the slider (set after 10-05) is not about it.
    expect(guide(stalled, '2026-10-03', 1, { adjust: 3, anchor: '2026-10-01' }).target).toBeNull();
  });

  it('no +1 target after a long break - the counter starts over', () => {
    const history = buildHistoryPoints(stalled);
    const timeline = progressTimeline(history, 15);
    const dates = ['2026-10-01', '2026-10-03', '2026-10-05'];
    const opts = { tryMoreAfterWorkouts: 2, workoutDates: dates };
    expect(sessionGuide(history, timeline, '2026-10-26', opts).target).toBeNull();
    expect(sessionGuide(history, timeline, '2026-10-26', opts).counterBefore).toBe(0);
    expect(sessionGuide(history, timeline, '2026-10-26', opts).previous).toMatchObject({ date: '2026-10-05' });
    expect(sessionGuide(history, timeline, '2026-10-12', opts).target).not.toBeNull();
  });

  it('no +1 target at the top of the rep range - that calls for weight', () => {
    const top = [...session('2026-10-01', 10, [15]), ...session('2026-10-03', 10, [15]), ...session('2026-10-05', 10, [15])];
    expect(guide(top, '2026-10-07').target).toBeNull();
  });
});
