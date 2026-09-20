import type { TFunction } from 'i18next';
import type { ExerciseProgression } from '../types/index.js';

// Builds the reminder text client-side from the numeric fields the backend
// already sends (repRangeMax, weightStepKg, daysSinceProgress), instead of
// showing the backend's own `message` string - that string is generated
// server-side in a fixed language, so it wouldn't follow the UI's language.
export function progressionMessage(p: ExerciseProgression, t: TFunction): string {
  return t(`progression.message.${p.suggestion}`, {
    repRangeMax: p.repRangeMax,
    weightStep: p.weightStepKg,
    days: p.daysSinceProgress,
  });
}
