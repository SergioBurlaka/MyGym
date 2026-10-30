import type { ExerciseProgression, MuscleCategory, WorkoutProgressAt } from '../types/index.js';

// Mirrors DEFAULT_TRY_MORE_AFTER_WORKOUTS in backend progression.service.ts
// - sessions without progress when neither the program nor the exercise
// sets a count.
export const DEFAULT_TRY_MORE_AFTER_WORKOUTS: Record<MuscleCategory, number> = {
  large: 4,
  small: 6,
  bodyweight: 5,
};

export type TryMoreStatus =
  | { kind: 'unknown' }
  | { kind: 'no_data' }
  | { kind: 'first' }
  | { kind: 'progress' }
  | { kind: 'after_break' }
  | { kind: 'add_weight' }
  | { kind: 'due'; done: number; total: number }
  | { kind: 'countdown'; done: number; total: number; left: number };

// How far an exercise is from the "try_more" nudge under ONE program's
// threshold (the exercise's own value there, else the category default).
// Computed here rather than taken from p.suggestion: the backend judges an
// exercise by the smallest threshold across all programs that include it,
// while a program card should count down to its own. Without a threshold
// (null) it uses the backend's.
export function tryMoreStatus(p: ExerciseProgression | undefined, threshold: number | null): TryMoreStatus {
  // Not in the overview at all (e.g. an archived exercise) - nothing to say.
  if (!p) return { kind: 'unknown' };
  if (p.suggestion === 'no_data') return { kind: 'no_data' };
  // Topping the rep range wins over the stall reminder on the backend too.
  if (p.suggestion === 'increase_weight' || p.suggestion === 'start_adding_weight') return { kind: 'add_weight' };

  const total = threshold ?? p.tryMoreAfterWorkouts;
  const done = p.sessionsSinceProgress ?? 0;
  if (done >= total) return { kind: 'due', done, total };
  return { kind: 'countdown', done, total, left: total - done };
}

// The same scale for a journal workout: where the counter stood after that
// session (backend's progressAt), with the same rule priority as the
// backend's suggestion - top of the rep range first.
export function journalTryMoreStatus(p: WorkoutProgressAt | null | undefined): TryMoreStatus {
  if (!p) return { kind: 'unknown' };
  if (p.atTopOfRange) return { kind: 'add_weight' };
  if (p.isFirst) return { kind: 'first' };
  if (p.isProgress) return { kind: 'progress' };
  if (p.afterBreak) return { kind: 'after_break' };

  const total = p.tryMoreAfterWorkouts;
  const done = p.sessionsSinceProgress;
  if (done >= total) return { kind: 'due', done, total };
  return { kind: 'countdown', done, total, left: total - done };
}

// Sort order for the Progress chips - what needs doing today first: add
// weight, then "try more" already due, then closest to the nudge (fewest
// workouts left), then no data. Ties are left to the caller.
export function tryMoreUrgency(status: TryMoreStatus): number {
  switch (status.kind) {
    case 'add_weight':
      return -2;
    case 'due':
      return -1;
    case 'countdown':
      return status.left;
    case 'no_data':
    case 'unknown':
      return Number.POSITIVE_INFINITY;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}
