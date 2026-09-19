export function formatTotalWeight(weightPerUnitKg: string | number | null, weightUnits: number | null): string {
  if (weightPerUnitKg == null) return '—';
  const perUnit = Number(weightPerUnitKg);
  const units = weightUnits ?? 2;
  const total = perUnit * units;
  return `${total} кг (${units}×${perUnit})`;
}

export function formatDuration(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return null;
  const minutes = Math.round(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} год ${m} хв` : `${m} хв`;
}

export function formatDateUk(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });
}
