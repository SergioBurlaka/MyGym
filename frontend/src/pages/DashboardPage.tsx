import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '../hooks/usePageTitle.js';
import {
  useWorkoutsQuery,
  useStartWorkoutMutation,
  useWorkoutTemplatesQuery,
  useDeleteWorkoutMutation,
  useRemoveSampleWorkoutsMutation,
} from '../shared/api/workouts/index.js';
import { useProgressionQuery } from '../shared/api/progression/index.js';
import { useProgramsQuery } from '../shared/api/programs/index.js';
import { formatDate, formatDuration, formatKg, setsSummary } from '../utils/weight.js';
import { todayIso } from '../utils/date.js';
import SetsSummary from '../components/SetsSummary.js';
import { progressionMessage } from '../utils/progressionMessage.js';
import ProgressionBadge from '../components/ProgressionBadge.js';
import Pagination from '../components/Pagination.js';
import NewWorkoutButton from '../components/NewWorkoutButton.js';
import ConsistencyCalendar from '../components/ConsistencyCalendar.js';
import Popconfirm from '../components/Popconfirm.js';
import { labelColor } from '../utils/labelColor.js';
import { journalTryMoreStatus } from '../utils/tryMoreCountdown.js';
import TryMoreStatusBadge from '../components/TryMoreStatusBadge.js';
import type { ExerciseProgression, Workout, WorkoutExercise } from '../types/index.js';

const PAGE_SIZE = 20;

export default function DashboardPage() {
  const { t } = useTranslation();
  usePageTitle(t('nav.journal'));
  const navigate = useNavigate();

  // Page lives in the URL (not local state) so it survives navigating into
  // a workout and back — the browser's back button restores `?page=N`
  // instead of always landing back on page 1.
  const [searchParams, setSearchParams] = useSearchParams();
  const pageParam = Number(searchParams.get('page'));
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  function goToPage(nextPage: number) {
    setSearchParams(nextPage <= 1 ? {} : { page: String(nextPage) }, { replace: true });
  }

  const workoutsQuery = useWorkoutsQuery({ page, pageSize: PAGE_SIZE });
  const progressionQuery = useProgressionQuery();
  const templatesQuery = useWorkoutTemplatesQuery();
  const programsQuery = useProgramsQuery();
  const startWorkoutMutation = useStartWorkoutMutation();

  const workouts = workoutsQuery.data?.data ?? [];
  const progression = progressionQuery.data ?? [];
  const templates = templatesQuery.data ?? [];
  const programs = programsQuery.data ?? [];

  async function startWorkout(opts: { programLabel?: string; copyFromWorkoutId?: string; programId?: string }) {
    // The device's day: the account's time zone is only updated from the Schedule page.
    const workout = await startWorkoutMutation.mutateAsync({ ...opts, date: todayIso() });
    navigate(`/workouts/${workout.id}`);
  }

  const needsAttention = progression.filter(
    (p) => p.suggestion === 'try_more' || p.suggestion === 'increase_weight' || p.suggestion === 'start_adding_weight',
  );

  // Groups the current page's workouts by calendar month for the mobile
  // list's section headers - relies on `workouts` already being sorted
  // newest-first by the backend, so a month change is always a new group.
  const monthGroups = useMemo(() => {
    const groups: { label: string; workouts: Workout[] }[] = [];
    for (const w of workouts) {
      const label = formatDate(w.date, { month: 'long', year: 'numeric' }).toUpperCase();
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.workouts.push(w);
      else groups.push({ label, workouts: [w] });
    }
    return groups;
  }, [workouts]);

  if (workoutsQuery.isPending || progressionQuery.isPending) {
    return <p className="text-slate-400">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl text-slate-100">{t('dashboard.title')}</h1>
        <NewWorkoutButton
          programs={programs}
          templates={templates}
          busy={startWorkoutMutation.isPending}
          onStart={startWorkout}
        />
      </div>

      {needsAttention.length > 0 && (
        <div className="card hidden border-accent/40 sm:block">
          <h2 className="mb-3 text-lg text-slate-100">{t('dashboard.reminders')}</h2>
          <ul className="space-y-2">
            {needsAttention.map((p) => (
              <li key={p.exerciseId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-slate-200">{p.name}</span>
                <span className="flex items-center gap-2 text-slate-400">
                  {progressionMessage(p, t)}
                  <ProgressionBadge suggestion={p.suggestion} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {needsAttention.length > 0 && <MobileRemindersCard items={needsAttention} />}

      {(workoutsQuery.data?.sampleCount ?? 0) > 0 && <SamplesNote count={workoutsQuery.data!.sampleCount} />}

      <div className="card">
        <h2 className="mb-3 text-lg text-slate-100">{t('dashboard.calendarTitle')}</h2>
        <ConsistencyCalendar />
      </div>

      <div className="hidden space-y-3 sm:block">
        {/* The phone list has month headings; this one needs its own above the cards' h3. */}
        <h2 className="sr-only">{t('dashboard.workoutsHeading')}</h2>
        {workouts.length === 0 && <p className="text-slate-400">{t('dashboard.emptyJournal')}</p>}
        {workouts.map((w) => {
          const duration = formatDuration(w.timeStart, w.timeEnd, w.autoFinished, w.pausedMs);
          const colors = w.programLabel ? labelColor(w.programLabel) : null;
          return (
            // A link stretched over the card (see WorkoutCardLink), not a
            // button around it: a short name, Ctrl-click / new tab work.
            <div
              key={w.id}
              className={`card relative transition-colors hover:border-accent/50 ${
                colors ? `border-l-4 ${colors.border}` : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-sans text-base font-semibold tracking-normal text-slate-100">
                  <WorkoutCardLink workout={w}>{formatDate(w.date)}</WorkoutCardLink>
                  {w.programLabel && colors && (
                    <span aria-hidden="true" className={`badge ${colors.badgeBg} ${colors.badgeText}`}>
                      {w.programLabel}
                    </span>
                  )}
                  {w.isSample && <SampleBadge />}
                </h3>
                <span className="text-xs text-slate-400">
                  {duration ?? (w.timeEnd ? '' : t('dashboard.inProgress'))}
                  {w.autoFinished && (
                    <span className="relative z-10" title={t('workout.autoFinishedHint')}>
                      {duration ? ' · ' : ''}
                      {t('dashboard.autoFinished')}
                    </span>
                  )}
                </span>
              </div>
              {w.workoutExercises.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">{t('dashboard.emptyWorkout')}</p>
              ) : (
                <ul className="mt-2 divide-y divide-surface-border text-sm text-slate-400">
                  {w.workoutExercises.map((we) => (
                    <li key={we.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5">
                      <span>
                        {we.exercise.name}:{' '}
                        <SetsSummary workoutExercise={we} perSideClassName="ml-2 text-xs text-slate-400" />
                      </span>
                      <TryMoreStatusBadge status={journalTryMoreStatus(we.progressAt)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-4 sm:hidden">
        {workouts.length === 0 && <p className="text-slate-400">{t('dashboard.emptyJournal')}</p>}
        {monthGroups.map((group) => (
          <div key={group.label} className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">{group.label}</h2>
            {group.workouts.map((w) => (
              <MobileWorkoutCard key={w.id} workout={w} />
            ))}
          </div>
        ))}
      </div>

      {workoutsQuery.data && (
        <Pagination
          page={workoutsQuery.data.page}
          totalPages={workoutsQuery.data.totalPages}
          onPageChange={goToPage}
          disabled={workoutsQuery.isFetching}
        />
      )}
    </div>
  );
}

// Compact "Спробуй більше" list for phones - collapses to the first 3
// reminders with a "show all" toggle instead of the desktop card's full
// sentence-per-exercise layout.
function MobileRemindersCard({ items }: { items: ExerciseProgression[] }) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 3);

  return (
    <div className="card space-y-2.5 sm:hidden">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f5a524" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M15 7h6v6" />
          </svg>
          {t('dashboard.reminders')}
        </h2>
        <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs font-bold text-warn">{items.length}</span>
      </div>
      <div className="divide-y divide-surface-border">
        {visible.map((p) => (
          <div key={p.exerciseId} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-slate-200">{p.name}</span>
            {p.suggestion === 'try_more' ? (
              <span className="text-xs font-semibold text-warn">
                {t('dashboard.reminderSessions', { count: p.sessionsSinceProgress ?? 0 })}
              </span>
            ) : (
              <ProgressionBadge suggestion={p.suggestion} />
            )}
          </div>
        ))}
      </div>
      {!showAll && items.length > 3 && (
        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-surface-border py-2.5 text-sm font-semibold text-slate-100"
          onClick={() => setShowAll(true)}
        >
          {t('dashboard.showAllReminders', { count: items.length })}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}

// Phone-sized workout card (design D): one surface - a two-line header (date +
// weekday and the kebab menu; label, exercise count, duration), then the
// exercises as plain rows split by lines, no nested cards.
function MobileWorkoutCard({ workout }: { workout: Workout }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const deleteMutation = useDeleteWorkoutMutation(workout.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen]);

  const colors = workout.programLabel ? labelColor(workout.programLabel) : null;
  const duration = formatDuration(workout.timeStart, workout.timeEnd, workout.autoFinished, workout.pausedMs);
  const dateLabel = formatDate(workout.date, { day: 'numeric', month: 'long' });
  const weekday = formatDate(workout.date, { weekday: 'short' });
  // Not just "no timeEnd": a CSV-imported workout has neither time and is done.
  const inProgress = Boolean(workout.timeStart) && !workout.timeEnd;

  function goToWorkout() {
    navigate(`/workouts/${workout.id}`);
  }

  return (
    <div className="card relative px-4 pb-0.5 pt-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5 pb-3">
          <h3 className="font-sans text-[19px] font-bold leading-tight tracking-normal text-slate-100">
            <WorkoutCardLink workout={workout}>
              {dateLabel} <span className="text-[15px] font-normal text-slate-400">· {weekday}</span>
            </WorkoutCardLink>
          </h3>
          {/* The text wraps beside the badge: "auto-finished" doesn't fit one line at 360px. */}
          <div className="flex items-center gap-2">
            {workout.programLabel && colors && (
              <span
                aria-hidden="true"
                className={`badge h-6 min-w-[24px] shrink-0 justify-center px-2 py-0 ${colors.badgeBg} ${colors.badgeText}`}
              >
                {workout.programLabel}
              </span>
            )}
            {workout.isSample && <SampleBadge />}
            <span className="min-w-0 text-[13px] text-slate-400">
              {t('programs.exerciseCount', { count: workout.workoutExercises.length })}
              {duration && ` · ${duration}`}
              {inProgress && ` · ${t('dashboard.inProgress')}`}
              {workout.autoFinished && (
                <>
                  {' · '}
                  <span className="relative z-10" title={t('workout.autoFinishedHint')}>
                    {t('dashboard.autoFinished')}
                  </span>
                </>
              )}
            </span>
          </div>
        </div>
        {/* Above the stretched card link: a tap here opens the menu, not the workout.
            Open, it also rises above the next card's menu button. */}
        <div className={`relative shrink-0 ${menuOpen ? 'z-30' : 'z-10'}`} ref={menuRef}>
          <button
            type="button"
            aria-label={t('dashboard.workoutMenuLabel', { date: dateLabel })}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-surface-border hover:text-white"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-44 animate-pop-in rounded-lg border border-surface-border bg-surface-raised p-1.5 shadow-xl">
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-200 hover:bg-surface-border"
                onClick={() => {
                  setMenuOpen(false);
                  goToWorkout();
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 20h4L19 9l-4-4L4 16z" />
                </svg>
                {t('common.edit')}
              </button>
              <Popconfirm
                title={t('workout.deleteConfirmTitle')}
                description={t('workout.deleteConfirmDescription')}
                onConfirm={() => {
                  setMenuOpen(false);
                  deleteMutation.mutate();
                }}
              >
                <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-red-400 hover:bg-surface-border">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                  </svg>
                  {t('common.delete')}
                </button>
              </Popconfirm>
            </div>
          )}
        </div>
      </div>

      {workout.workoutExercises.length === 0 ? (
        <p className="border-t border-surface-border py-3 text-sm text-slate-400">{t('dashboard.emptyWorkout')}</p>
      ) : (
        workout.workoutExercises.map((we) => <JournalExerciseRow key={we.id} workoutExercise={we} />)
      )}
    </div>
  );
}

// One exercise of the phone card: name over reps on the left, weight over the
// per-side hint on the right - the two lower cells share a line, so the row's
// height doesn't jump. Reads setsSummary() directly because SetsSummary's single
// line can't be split across a grid; its rules stay: no sets is "—" and no
// weight, bodyweight leaves the right column empty.
function JournalExerciseRow({ workoutExercise: we }: { workoutExercise: WorkoutExercise }) {
  const { t } = useTranslation();
  const { totalKg, perSideKg, reps } = setsSummary(we);
  const done = reps.length > 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-t border-surface-border py-3">
      <span className="break-words text-base font-semibold leading-snug text-slate-100">{we.exercise.name}</span>
      <span className="whitespace-nowrap text-right text-[17px] font-bold tabular-nums text-slate-100">
        {done && totalKg != null && `${formatKg(totalKg)} ${t('common.kg')}`}
      </span>
      <span className="text-sm tabular-nums text-slate-300">{done ? reps.join(' · ') : '—'}</span>
      <span className="whitespace-nowrap text-right text-xs text-hint">
        {done && perSideKg != null && t('dashboard.perSide', { weight: formatKg(perSideKg) })}
      </span>
      <span className="col-span-2 mt-1.5 empty:hidden">
        <TryMoreStatusBadge status={journalTryMoreStatus(we.progressAt)} variant="row" />
      </span>
    </div>
  );
}

// The workout's link, stretched over its whole card (the card is `relative`):
// the card stays clickable, but the link's name is just the date and label -
// not the card's 500 characters, and no button nested in a button. The ring
// goes round the card. Anything else clickable in the card sits above it.
function WorkoutCardLink({ workout, children }: { workout: Workout; children: React.ReactNode }) {
  return (
    <Link
      to={`/workouts/${workout.id}`}
      className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-accent"
    >
      {children}
      {workout.programLabel && <span className="sr-only"> · {workout.programLabel}</span>}
    </Link>
  );
}

function SampleBadge() {
  const { t } = useTranslation();
  return <span className="badge bg-surface-border text-slate-300">{t('dashboard.samples.badge')}</span>;
}

// Above the calendar while a new account still has its sample workouts:
// says what they are, and removes them all at once (programs stay).
function SamplesNote({ count }: { count: number }) {
  const { t } = useTranslation();
  const removeSamples = useRemoveSampleWorkoutsMutation();
  return (
    <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-base font-semibold text-slate-100">{t('dashboard.samples.title')}</h2>
        <p className="text-sm text-slate-400">{t('dashboard.samples.description', { count })}</p>
        {removeSamples.isError && <p className="mt-1 text-sm text-red-400">{t('dashboard.samples.error')}</p>}
      </div>
      <Popconfirm
        title={t('dashboard.samples.confirmTitle')}
        description={t('dashboard.samples.confirmDescription')}
        confirmText={t('dashboard.samples.confirm')}
        onConfirm={() => removeSamples.mutate()}
      >
        <button className="btn-secondary shrink-0 whitespace-nowrap" disabled={removeSamples.isPending}>
          {removeSamples.isPending ? t('dashboard.samples.removing') : t('dashboard.samples.remove')}
        </button>
      </Popconfirm>
    </div>
  );
}
