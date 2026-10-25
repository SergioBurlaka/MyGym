import { useTranslation } from 'react-i18next';
import type { WorkoutExercise } from '../types/index.js';
import { setsSummary } from '../utils/weight.js';

// "32.5 kg · 12 · 12 · 10" - the weight once (it's fixed for the whole
// exercise), then every set's reps, so a drop in reps is visible (user's
// choice 2026-10-25, UX audit finding 06). Each number stays unbroken; the
// line may wrap between sets on a narrow screen. `perSide` adds the
// "16.25 kg × 2 per side" line for two-sided loads.
export default function SetsSummary({
  workoutExercise,
  className = '',
  perSideClassName = '',
}: {
  workoutExercise: Pick<WorkoutExercise, 'weightPerUnitKg' | 'weightUnits' | 'sets'>;
  className?: string;
  perSideClassName?: string;
}) {
  const { t } = useTranslation();
  const { totalKg, perSideKg, reps } = setsSummary(workoutExercise);
  const parts = [...(totalKg != null ? [`${totalKg} ${t('common.kg')}`] : []), ...reps.map(String)];

  return (
    <>
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
      {perSideKg != null && (
        <span className={perSideClassName}>{t('dashboard.perSide', { weight: perSideKg })}</span>
      )}
    </>
  );
}
