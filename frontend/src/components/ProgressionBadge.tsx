import type { ProgressionSuggestion } from '../types/index.js';

const STYLES: Record<ProgressionSuggestion, string> = {
  no_data: 'bg-surface-border text-slate-400',
  ok: 'bg-good/15 text-good',
  try_more: 'bg-warn/15 text-warn',
  increase_weight: 'bg-accent/15 text-accent',
  start_adding_weight: 'bg-accent/15 text-accent',
};

const LABELS: Record<ProgressionSuggestion, string> = {
  no_data: 'Немає даних',
  ok: 'Прогрес у нормі',
  try_more: 'Спробуй більше',
  increase_weight: 'Час додати вагу',
  start_adding_weight: 'Час додати вагу',
};

export default function ProgressionBadge({
  suggestion,
  title,
}: {
  suggestion: ProgressionSuggestion;
  title?: string;
}) {
  return (
    <span className={`badge ${STYLES[suggestion]}`} title={title}>
      {LABELS[suggestion]}
    </span>
  );
}
