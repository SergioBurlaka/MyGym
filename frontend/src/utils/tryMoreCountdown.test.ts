import { describe, expect, it } from 'vitest';
import type { WorkoutProgressAt } from '../types/index.js';
import { journalTryMoreStatus } from './tryMoreCountdown.js';

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
