import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useWorkoutsQuery,
  useStartWorkoutMutation,
  useWorkoutTemplatesQuery,
  useDeleteWorkoutMutation,
  useRemoveSampleWorkoutsMutation,
} from '../shared/api/workouts/index.js';
import { useProgressionQuery } from '../shared/api/progression/index.js';
import { useProgramsQuery } from '../shared/api/programs/index.js';
import { formatDate, formatDuration } from '../utils/weight.js';
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
import type { ExerciseProgression, Workout } from '../types/index.js';

const PAGE_SIZE = 20;

export default function DashboardPage() {
  const { t } = useTranslation();
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
    const workout = await startWorkoutMutation.mutateAsync(opts);
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
        {workouts.length === 0 && <p className="text-slate-400">{t('dashboard.emptyJournal')}</p>}
        {workouts.map((w) => {
          const duration = formatDuration(w.timeStart, w.timeEnd, w.autoFinished, w.pausedMs);
          const colors = w.programLabel ? labelColor(w.programLabel) : null;
          return (
            <button
              key={w.id}
              onClick={() => navigate(`/workouts/${w.id}`)}
              className={`card block w-full text-left transition-colors hover:border-accent/50 ${
                colors ? `border-l-4 ${colors.border}` : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-slate-100">{formatDate(w.date)}</span>
                  {w.programLabel && colors && (
                    <span className={`badge ${colors.badgeBg} ${colors.badgeText}`}>{w.programLabel}</span>
                  )}
                  {w.isSample && <SampleBadge />}
                </span>
                <span className="text-xs text-slate-400">
                  {duration ?? (w.timeEnd ? '' : t('dashboard.inProgress'))}
                  {w.autoFinished && (
                    <span title={t('workout.autoFinishedHint')}>
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
            </button>
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

// Phone-sized workout card: date + weekday, program-label pill, a kebab
// menu (edit/delete) instead of the desktop row's plain click target, and
// each exercise as its own row with a two-line weight/reps summary.
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

  function goToWorkout() {
    navigate(`/workouts/${workout.id}`);
  }

  return (
    <div
      className="card space-y-3"
      role="button"
      tabIndex={0}
      onClick={goToWorkout}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') goToWorkout();
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold text-slate-100">
            {dateLabel} <span className="font-normal text-slate-400">· {weekday}</span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {workout.programLabel && colors && (
              <span className={`badge ${colors.badgeBg} ${colors.badgeText}`}>{workout.programLabel}</span>
            )}
            {workout.isSample && <SampleBadge />}
            <span className="text-xs text-slate-400">
              {t('programs.exerciseCount', { count: workout.workoutExercises.length })}
            </span>
          </div>
        </div>
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            aria-label={t('dashboard.workoutMenuLabel', { date: dateLabel })}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-surface-border hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 z-20 mt-1 w-44 animate-pop-in rounded-lg border border-surface-border bg-surface-raised p-1.5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
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
        <p className="text-sm text-slate-400">{t('dashboard.emptyWorkout')}</p>
      ) : (
        <div className="space-y-1.5">
          {workout.workoutExercises.map((we) => {
            return (
              <div key={we.id} className="flex flex-col gap-2 rounded-lg bg-surface-border px-3 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 text-slate-200">{we.exercise.name}</span>
                  {/* Capped, not shrink-0: a long set list wraps between sets
                      instead of squeezing the name or overflowing at 375px. */}
                  <span className="flex max-w-[60%] flex-col items-end text-right leading-tight">
                    <SetsSummary
                      workoutExercise={we}
                      className="font-semibold text-slate-100"
                      perSideClassName="mt-0.5 text-xs text-slate-400"
                    />
                  </span>
                </div>
                {/* Full width under the row - the segments need it (design 5). */}
                <TryMoreStatusBadge status={journalTryMoreStatus(we.progressAt)} className="w-full" />
              </div>
            );
          })}
        </div>
      )}

      {(duration || workout.autoFinished) && (
        <div className="flex items-center gap-2 border-t border-surface-border pt-2.5 text-xs text-slate-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span>
            {duration}
            {workout.autoFinished && (
              <span title={t('workout.autoFinishedHint')}>
                {duration ? ' · ' : ''}
                {t('dashboard.autoFinished')}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
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
