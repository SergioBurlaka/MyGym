import type { TFunction } from 'i18next';
import type { ExerciseProgression } from '../types/index.js';

// Builds the reminder text client-side from the numeric fields the backend
// already sends (repRangeMax, weightStepKg, daysSinceProgress), instead of
// showing the backend's own `message` string - that string is generated
// server-side in a fixed language, so it wouldn't follow the UI's language.
export function progressionMessage(p: ExerciseProgression, t: TFunction): string {
  // A program can override the default 14-calendar-day "try_more" rule with
  // a workout-count one (programs.tryMoreAfterWorkouts) - when that applies
  // to this exercise, phrase the reminder in sessions, not days.
  const key =
    p.suggestion === 'try_more' && p.tryMoreAfterWorkouts != null
      ? 'progression.message.try_more_sessions'
      : `progression.message.${p.suggestion}`;
  return t(key, {
    repRangeMax: p.repRangeMax,
    weightStep: p.weightStepKg,
    days: p.daysSinceProgress,
    sessions: p.sessionsSinceProgress,
  });
}
