import { useTranslation } from 'react-i18next';
import type { ProgressionSuggestion } from '../types/index.js';

const STYLES: Record<ProgressionSuggestion, string> = {
  no_data: 'bg-surface-border text-slate-400',
  ok: 'bg-good/15 text-good',
  try_more: 'bg-warn/15 text-warn',
  increase_weight: 'bg-accent/15 text-accent',
  start_adding_weight: 'bg-accent/15 text-accent',
};

export default function ProgressionBadge({
  suggestion,
  title,
}: {
  suggestion: ProgressionSuggestion;
  title?: string;
}) {
  const { t } = useTranslation();
  return (
    <span className={`badge ${STYLES[suggestion]}`} title={title}>
      {t(`progression.badge.${suggestion}`)}
    </span>
  );
}
