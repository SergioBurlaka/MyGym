import { useTranslation } from 'react-i18next';
import type { WorkoutExercise } from '../types/index.js';
import { formatKg, setsSummary } from '../utils/weight.js';

// "32.5 kg · 12 · 12 · 10" - the weight once (it's fixed for the whole
// exercise), then every set's reps, so a drop in reps is visible (user's
// choice 2026-10-25, UX audit finding 06). Each number stays unbroken; the
// line may wrap between sets on a narrow screen. No sets logged (e.g. copied
// from a template) shows "—", not a bare weight that looks like a done set.
export default function SetsSummary({
  workoutExercise,
  className = '',
}: {
  workoutExercise: Pick<WorkoutExercise, 'weightPerUnitKg' | 'weightUnits' | 'barKg' | 'exercise' | 'sets'>;
  className?: string;
}) {
  const { t } = useTranslation();
  const { totalKg, reps } = setsSummary(workoutExercise);
  const parts =
    reps.length === 0 ? [] : [...(totalKg != null ? [`${formatKg(totalKg)} ${t('common.kg')}`] : []), ...reps.map(String)];

  return (
    <span className={className}>
      {parts.length === 0
        ? '—'
        : parts.map((part, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              <span className="whitespace-nowrap">{part}</span>
            </span>
          ))}
    </span>
  );
}
