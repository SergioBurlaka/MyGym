import { useTranslation } from 'react-i18next';
import type { TryMoreStatus } from '../utils/tryMoreCountdown.js';

// Text + progress bar for an exercise's place on the "try more" scale -
// shared by the Programs cards, the journal and the workout page. Everywhere
// the same countdown in workouts: "N workouts to 'Try more'" (user's decision
// 2026-10-25 - a "done / total" fraction read as "to progress").
export default function TryMoreStatusBadge({ status }: { status: TryMoreStatus }) {
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
    case 'after_break':
      return <span className="text-xs text-slate-400">{t('progressStatus.afterBreak')}</span>;
    case 'add_weight':
      return <span className="text-xs font-semibold text-good">{t('progressStatus.addWeight')}</span>;
  }

  const due = status.kind === 'due';
  const percent = Math.min(100, Math.round((status.done / status.total) * 100));
  const text = due ? t('progressStatus.due') : t('progressStatus.sessionsLeft', { count: status.left });

  return (
    <span
      className="flex min-w-0 items-center gap-2"
      title={t('progressStatus.progressTitle', { done: status.done, count: status.total })}
    >
      <span className={`min-w-0 text-xs ${due ? 'font-semibold text-warn' : 'text-slate-400'}`}>{text}</span>
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-border" aria-hidden="true">
        <span className={`block h-full rounded-full ${due ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}
