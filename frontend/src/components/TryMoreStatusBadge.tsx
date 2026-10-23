import { useTranslation } from 'react-i18next';
import type { TryMoreStatus } from '../utils/tryMoreCountdown.js';

// Text + progress bar for an exercise's place on the "try more" scale -
// shared by the Programs cards (label = what's left) and the journal cards
// (label = done / total as of that workout).
export default function TryMoreStatusBadge({
  status,
  label = 'left',
}: {
  status: TryMoreStatus;
  label?: 'left' | 'fraction';
}) {
  const { t } = useTranslation();

  switch (status.kind) {
    case 'unknown':
      return null;
    case 'no_data':
      return <span className="text-xs text-slate-500">{t('progressStatus.noData')}</span>;
    case 'first':
      return <span className="text-xs text-slate-500">{t('progressStatus.first')}</span>;
    case 'progress':
      return <span className="text-xs font-semibold text-good">{t('progressStatus.progress')}</span>;
    case 'add_weight':
      return <span className="text-xs font-semibold text-good">{t('progressStatus.addWeight')}</span>;
  }

  const due = status.kind === 'due';
  const percent = Math.min(100, Math.round((status.done / status.total) * 100));
  let text: string;
  if (due) text = t('progressStatus.due');
  else if (label === 'fraction')
    text = t(status.unit === 'sessions' ? 'progressStatus.fractionSessions' : 'progressStatus.fractionDays', {
      done: status.done,
      total: status.total,
    });
  else
    text = t(status.unit === 'sessions' ? 'progressStatus.sessionsLeft' : 'progressStatus.daysLeft', {
      count: status.left,
    });

  return (
    <span
      className="flex items-center gap-2"
      title={t('progressStatus.progressTitle', { done: status.done, total: status.total })}
    >
      <span className={`whitespace-nowrap text-xs ${due ? 'font-semibold text-warn' : 'text-slate-400'}`}>{text}</span>
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-border" aria-hidden="true">
        <span className={`block h-full rounded-full ${due ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}
