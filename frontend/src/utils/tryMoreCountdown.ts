import type { ExerciseProgression } from '../types/index.js';

// Mirrors PROGRESS_REMINDER_DAYS in backend progression.service.ts - the
// rule that applies when neither the program nor the exercise sets a
// workout count.
export const DEFAULT_TRY_MORE_DAYS = 14;

export type TryMoreStatus =
  | { kind: 'no_data' }
  | { kind: 'add_weight' }
  | { kind: 'due'; unit: 'sessions' | 'days'; done: number; total: number }
  | { kind: 'countdown'; unit: 'sessions' | 'days'; done: number; total: number; left: number };

// How far an exercise is from the "try_more" nudge under ONE program's
// threshold (the exercise's own value there, else the program's). Computed
// here rather than taken from p.suggestion: the backend judges an exercise
// by the smallest threshold across all programs that include it, while a
// program card should count down to its own.
export function tryMoreStatus(p: ExerciseProgression | undefined, threshold: number | null): TryMoreStatus {
  if (!p || p.suggestion === 'no_data') return { kind: 'no_data' };
  // Topping the rep range wins over the stall reminder on the backend too.
  if (p.suggestion === 'increase_weight' || p.suggestion === 'start_adding_weight') return { kind: 'add_weight' };

  const unit = threshold != null ? 'sessions' : 'days';
  const total = threshold ?? DEFAULT_TRY_MORE_DAYS;
  const done = (unit === 'sessions' ? p.sessionsSinceProgress : p.daysSinceProgress) ?? 0;
  if (done >= total) return { kind: 'due', unit, done, total };
  return { kind: 'countdown', unit, done, total, left: total - done };
}
