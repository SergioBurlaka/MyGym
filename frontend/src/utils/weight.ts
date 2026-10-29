import i18n from '../i18n/index.js';
import type { Equipment } from '../types/index.js';

// The load model - mirror of backend/src/modules/progression/load.ts, change
// both together:
//   barbell    weightPerUnitKg = plates on ONE side -> bar + 2 x plates
//   dumbbell   weightPerUnitKg = ONE dumbbell, weightUnits = dumbbells
//              moving in ONE rep -> units x dumbbell
//   bodyweight weightPerUnitKg = added weight (null = none)
// A unilateral exercise logs reps per side; its volume counts both.

type LoggedLoad = {
  weightPerUnitKg: string | number | null;
  weightUnits: number | null;
  barKg?: string | number | null;
};

// Rounded to grams so 16.25 × 2 can't print as 32.49999.
function grams(kg: number): number {
  return Math.round(kg * 1000) / 1000;
}

// Weight moved in one rep; null when no weight was logged.
export function loadPerRep(equipment: Equipment, load: LoggedLoad): number | null {
  if (load.weightPerUnitKg == null) return null;
  const perUnit = Number(load.weightPerUnitKg);
  if (equipment === 'barbell') return grams((load.barKg == null ? 0 : Number(load.barKg)) + 2 * perUnit);
  if (equipment === 'dumbbell') return grams((load.weightUnits ?? 2) * perUnit);
  return perUnit;
}

export function sidesOf(unilateral: boolean): 1 | 2 {
  return unilateral ? 2 : 1;
}

// kg moved: load per rep x all reps (both sides); null without weight.
export function volumeKg(loadKg: number | null, reps: number[], unilateral: boolean): number | null {
  if (loadKg == null || loadKg <= 0) return null;
  return grams(loadKg * reps.reduce((a, b) => a + b, 0) * sidesOf(unilateral));
}

// "Try more" target: last time's reps with +1 in the weakest set (the first
// of equals). The backend sends it ready (WorkoutExercise.target); this is
// for the form while the user edits.
export function targetReps(lastReps: number[]): { reps: number[]; upSetIndex: number } | null {
  let upSetIndex = -1;
  lastReps.forEach((r, i) => {
    if (upSetIndex === -1 || r < lastReps[upSetIndex]) upSetIndex = i;
  });
  if (upSetIndex === -1) return null;
  return { reps: lastReps.map((r, i) => (i === upSetIndex ? r + 1 : r)), upSetIndex };
}

// Last time's reps for set `index`: the same set, or the last one there was.
export function lastRepsForSet(lastReps: number[], index: number): number | null {
  if (lastReps.length === 0) return null;
  return lastReps[Math.min(index, lastReps.length - 1)];
}

// The numbers behind a journal line (components/SetsSummary.tsx): weight in
// one rep (null without weight - 0 kg counts as none, as in the progression
// rules), the plates per side for a barbell, and reps in set order.
export function setsSummary(we: LoggedLoad & {
  exercise: { equipment: Equipment };
  sets: { setNumber: number; reps: number }[];
}): { totalKg: number | null; perSideKg: number | null; reps: number[] } {
  const totalKg = loadPerRep(we.exercise.equipment, we);
  const weighted = totalKg != null && totalKg > 0;
  return {
    totalKg: weighted ? totalKg : null,
    perSideKg: weighted && we.exercise.equipment === 'barbell' ? Number(we.weightPerUnitKg) : null,
    reps: [...we.sets].sort((a, b) => a.setNumber - b.setNumber).map((s) => s.reps),
  };
}

// Longer than this is not a real session but a workout closed late (e.g. a
// "Finish" pressed days afterwards) - show that instead of "53 h 16 min".
// The auto-finish sweep and migration 0023 prevent such rows; this is a guard.
// An auto-finished workout was closed by the rule, so its hours are real.
const MAX_PLAUSIBLE_DURATION_MIN = 4 * 60;

// pausedMs - time the header timer was paused, not part of the workout.
export function formatDuration(
  start: string | null,
  end: string | null,
  autoFinished = false,
  pausedMs = 0,
): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime() - pausedMs;
  if (ms <= 0) return null;
  const minutes = Math.round(ms / 60000);
  if (minutes > MAX_PLAUSIBLE_DURATION_MIN && !autoFinished) {
    return i18n.t('duration.notClosedInTime', { h: MAX_PLAUSIBLE_DURATION_MIN / 60 });
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? i18n.t('duration.hoursMinutes', { h, m }) : i18n.t('duration.minutes', { m });
}

// Short axis labels for charts: 12000 -> "12K" / "12 тис." - a full
// five-digit number doesn't fit the narrow Y axis on a phone.
export function formatCompactNumber(value: number): string {
  const locale = i18n.language?.startsWith('uk') ? 'uk-UA' : 'en-US';
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

// Locale-aware date formatter driven by the current UI language, not a
// fixed 'uk-UA' - used everywhere a workout/history date is shown.
export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' }): string {
  const d = new Date(`${iso}T00:00:00`);
  const locale = i18n.language?.startsWith('uk') ? 'uk-UA' : 'en-US';
  return d.toLocaleDateString(locale, opts);
}
