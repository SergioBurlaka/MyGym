import i18n from '../i18n/index.js';

// The numbers behind a journal line (components/SetsSummary.tsx): total
// weight (null without weight - 0 kg counts as none, as in the progression
// rules), the per-side weight for two-sided loads, and reps in set order.
export function setsSummary(we: {
  weightPerUnitKg: string | number | null;
  weightUnits: number | null;
  sets: { setNumber: number; reps: number }[];
}): { totalKg: number | null; perSideKg: number | null; reps: number[] } {
  const perUnit = we.weightPerUnitKg == null ? 0 : Number(we.weightPerUnitKg);
  const units = we.weightUnits ?? 2;
  const weighted = perUnit > 0;
  return {
    // Rounded to grams so 16.25 × 2 can't print as 32.49999.
    totalKg: weighted ? Math.round(perUnit * units * 1000) / 1000 : null,
    perSideKg: weighted && units === 2 ? perUnit : null,
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
