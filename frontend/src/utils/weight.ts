import i18n from '../i18n/index.js';

export function formatTotalWeight(weightPerUnitKg: string | number | null, weightUnits: number | null): string {
  if (weightPerUnitKg == null) return '—';
  const perUnit = Number(weightPerUnitKg);
  const units = weightUnits ?? 2;
  const total = perUnit * units;
  return `${total} ${i18n.t('common.kg')} (${units}×${perUnit})`;
}

// Longer than this is not a real session but a workout closed late (e.g. a
// "Finish" pressed days afterwards) - show that instead of "53 h 16 min".
// The auto-finish sweep and migration 0023 prevent such rows; this is a guard.
// An auto-finished workout was closed by the rule, so its hours are real.
const MAX_PLAUSIBLE_DURATION_MIN = 4 * 60;

export function formatDuration(start: string | null, end: string | null, autoFinished = false): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return null;
  const minutes = Math.round(ms / 60000);
  if (minutes > MAX_PLAUSIBLE_DURATION_MIN && !autoFinished) {
    return i18n.t('duration.notClosedInTime', { h: MAX_PLAUSIBLE_DURATION_MIN / 60 });
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? i18n.t('duration.hoursMinutes', { h, m }) : i18n.t('duration.minutes', { m });
}

// Locale-aware date formatter driven by the current UI language, not a
// fixed 'uk-UA' - used everywhere a workout/history date is shown.
export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' }): string {
  const d = new Date(`${iso}T00:00:00`);
  const locale = i18n.language?.startsWith('uk') ? 'uk-UA' : 'en-US';
  return d.toLocaleDateString(locale, opts);
}
