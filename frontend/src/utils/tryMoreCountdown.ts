import type { ExerciseProgression } from '../types/index.js';

// Mirrors PROGRESS_REMINDER_DAYS in backend progression.service.ts - the
// rule that applies when neither the program nor the exercise sets a
// workout count.
export const DEFAULT_TRY_MORE_DAYS = 14;

export type TryMoreStatus =
  | { kind: 'unknown' }
  | { kind: 'no_data' }
  | { kind: 'add_weight' }
  | { kind: 'due'; unit: 'sessions' | 'days'; done: number; total: number }
  | { kind: 'countdown'; unit: 'sessions' | 'days'; done: number; total: number; left: number };

// How far an exercise is from the "try_more" nudge under ONE program's
// threshold (the exercise's own value there, else the program's). Computed
// here rather than taken from p.suggestion: the backend judges an exercise
// by the smallest threshold across all programs that include it, while a
// program card should count down to its own. When this program sets no
// count but another program does, the backend uses that count instead of
// days - so does the card, or it could say "due" while nothing nudges.
export function tryMoreStatus(p: ExerciseProgression | undefined, threshold: number | null): TryMoreStatus {
  // Not in the overview at all (e.g. an archived exercise) - nothing to say.
  if (!p) return { kind: 'unknown' };
  if (p.suggestion === 'no_data') return { kind: 'no_data' };
  // Topping the rep range wins over the stall reminder on the backend too.
  if (p.suggestion === 'increase_weight' || p.suggestion === 'start_adding_weight') return { kind: 'add_weight' };

  const sessions = threshold ?? p.tryMoreAfterWorkouts;
  const unit = sessions != null ? 'sessions' : 'days';
  const total = sessions ?? DEFAULT_TRY_MORE_DAYS;
  const done = (unit === 'sessions' ? p.sessionsSinceProgress : p.daysSinceProgress) ?? 0;
  if (done >= total) return { kind: 'due', unit, done, total };
  return { kind: 'countdown', unit, done, total, left: total - done };
}
