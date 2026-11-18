import { describe, expect, it } from 'vitest';
import type { ExerciseProgression, WorkoutProgressAt } from '../types/index.js';
import { journalTryMoreStatus, tryMoreStatus } from './tryMoreCountdown.js';

function at(over: Partial<WorkoutProgressAt>): WorkoutProgressAt {
  return {
    date: '2026-11-18',
    isFirst: false,
    isProgress: false,
    atTopOfRange: false,
    sessionsSinceProgress: 2,
    daysSinceProgress: 10,
    afterBreak: false,
    tryMoreAfterWorkouts: 4,
    ...over,
  };
}

describe('journalTryMoreStatus', () => {
  it('is nothing without a counter', () => {
    expect(journalTryMoreStatus(null)).toEqual({ kind: 'unknown' });
    expect(journalTryMoreStatus(undefined)).toEqual({ kind: 'unknown' });
  });

  it('counts down, and is due at the threshold', () => {
    expect(journalTryMoreStatus(at({}))).toEqual({ kind: 'countdown', done: 2, total: 4, left: 2 });
    expect(journalTryMoreStatus(at({ sessionsSinceProgress: 4 }))).toEqual({ kind: 'due', done: 4, total: 4 });
  });

  // A break is why the counter reset, not an event: the plain scale from 0.
  it('shows the reset countdown after a break without progress', () => {
    expect(journalTryMoreStatus(at({ afterBreak: true, sessionsSinceProgress: 0, daysSinceProgress: 0 }))).toEqual({
      kind: 'countdown',
      done: 0,
      total: 4,
      left: 4,
    });
  });

  it('keeps progress right after a break as progress', () => {
    expect(journalTryMoreStatus(at({ afterBreak: true, isProgress: true, sessionsSinceProgress: 0 }))).toEqual({
      kind: 'progress',
    });
  });

  it('puts the top of the rep range first, then a first session', () => {
    expect(journalTryMoreStatus(at({ atTopOfRange: true, isFirst: true, isProgress: true, afterBreak: true }))).toEqual({
      kind: 'add_weight',
    });
    expect(journalTryMoreStatus(at({ isFirst: true, isProgress: true, sessionsSinceProgress: 0 }))).toEqual({
      kind: 'first',
    });
  });
});

function overview(over: Partial<ExerciseProgression>): ExerciseProgression {
  return {
    exerciseId: 'e1',
    name: 'Bench press',
    category: 'large',
    repRangeMin: 8,
    repRangeMax: 12,
    weightStepKg: 2.5,
    lastWorkoutDate: '2026-11-10',
    lastTotalWeightKg: 60,
    lastMaxReps: 10,
    daysSinceLastWorkout: 8,
    daysSinceProgress: 8,
    sessionsSinceProgress: 1,
    tryMoreAfterWorkouts: 4,
    tryMoreIsDefault: true,
    suggestion: 'ok',
    ...over,
  };
}

describe('tryMoreStatus', () => {
  it('is nothing for an exercise missing from the overview', () => {
    expect(tryMoreStatus(undefined)).toEqual({ kind: 'unknown' });
  });

  it('passes no data and the add-weight rules through', () => {
    expect(tryMoreStatus(overview({ suggestion: 'no_data' }))).toEqual({ kind: 'no_data' });
    expect(tryMoreStatus(overview({ suggestion: 'increase_weight' }))).toEqual({ kind: 'add_weight' });
    expect(tryMoreStatus(overview({ suggestion: 'start_adding_weight' }))).toEqual({ kind: 'add_weight' });
  });

  it("counts down to the backend's threshold and is due at it", () => {
    expect(tryMoreStatus(overview({}))).toEqual({ kind: 'countdown', done: 1, total: 4, left: 3 });
    expect(tryMoreStatus(overview({ suggestion: 'try_more', sessionsSinceProgress: 4 }))).toEqual({ kind: 'due', done: 4, total: 4 });
    expect(tryMoreStatus(overview({ sessionsSinceProgress: null }))).toEqual({ kind: 'countdown', done: 0, total: 4, left: 4 });
  });
});
