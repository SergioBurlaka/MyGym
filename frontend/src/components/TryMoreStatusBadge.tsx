import { useTranslation } from 'react-i18next';
import type { TryMoreStatus } from '../utils/tryMoreCountdown.js';

// Above this many workouts the segments get too thin to count - one bar instead.
const MAX_SEGMENTS = 12;

// An exercise's place on the "try more" scale - shared by the Programs
// cards, the journal, the Progress chips and the workout page. The counter
// is the same everywhere (user's decision 2026-10-29, design 5): "To 'Try
// more'" on the left, "1 of 6 workouts" on the right, and below it one
// segment per workout. Spelling out both the label and "of N workouts"
// keeps the fraction from reading as "to progress" (UX audit 2026-10-25,
// finding 04). `className` sets the width - full on the workout page.
// Empty segments are slate-600: visible (>= 1.5:1) on a card and on the
// journal's surface-border rows alike, where a surface-border track vanished.
// `compact` (the Progress page tiles): no "To 'Try more'" label - the section
// title says it once - so a narrow tile doesn't wrap it onto three lines.
export default function TryMoreStatusBadge({
  status,
  className = 'w-full sm:w-56',
  compact = false,
}: {
  status: TryMoreStatus;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();

  switch (status.kind) {
    case 'unknown':
      return null;
    case 'no_data':
      return <span className="text-xs text-slate-400">{t('progressStatus.noData')}</span>;
    case 'first':
      return <span className="text-xs text-slate-400">{t('progressStatus.first')}</span>;
    case 'progress':
      return <span className="text-xs font-semibold text-good">{t('progressStatus.progress')}</span>;
    case 'after_break':
      return <span className="text-xs text-slate-400">{t('progressStatus.afterBreak')}</span>;
    case 'add_weight':
      return <span className="text-xs font-semibold text-good">{t('progressStatus.addWeight')}</span>;
  }

  const due = status.kind === 'due';
  const done = Math.min(status.done, status.total);
  const filled = due ? 'bg-warn' : 'bg-accent';

  return (
    <span
      role="img"
      aria-label={t(due ? 'progressStatus.dueAria' : 'progressStatus.countAria', { done, count: status.total })}
      className={`flex flex-col gap-1.5 ${className}`}
    >
      {compact ? (
        <span className="text-xs text-slate-400" aria-hidden="true">
          <b className={`text-[13px] tabular-nums ${due ? 'text-warn' : 'text-slate-100'}`}>{done}</b>{' '}
          {t('progressStatus.ofWorkouts', { count: status.total })}
        </span>
      ) : (
        <span className="flex items-baseline justify-between gap-2" aria-hidden="true">
          <span className={`text-xs ${due ? 'font-semibold text-warn' : 'text-slate-400'}`}>
            {due ? t('progressStatus.due') : t('progressStatus.toTryMore')}
          </span>
          <span className="whitespace-nowrap text-sm font-bold tabular-nums text-slate-100">
            {done} <span className="font-normal text-slate-400">{t('progressStatus.ofWorkouts', { count: status.total })}</span>
          </span>
        </span>
      )}
      {status.total <= MAX_SEGMENTS ? (
        <span className="flex gap-1" aria-hidden="true">
          {Array.from({ length: status.total }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < done ? filled : 'bg-slate-600'}`} />
          ))}
        </span>
      ) : (
        <span className="h-1.5 overflow-hidden rounded-full bg-slate-600" aria-hidden="true">
          <span className={`block h-full rounded-full ${filled}`} style={{ width: `${(done / status.total) * 100}%` }} />
        </span>
      )}
    </span>
  );
}
