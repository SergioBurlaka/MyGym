import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWorkoutsQuery, useStartWorkoutMutation, useWorkoutTemplatesQuery } from '../shared/api/workouts/index.js';
import { useProgressionQuery } from '../shared/api/progression/index.js';
import { useProgramsQuery } from '../shared/api/programs/index.js';
import { formatDateUk, formatDuration, formatTotalWeight } from '../utils/weight.js';
import ProgressionBadge from '../components/ProgressionBadge.js';
import Pagination from '../components/Pagination.js';
import NewWorkoutButton from '../components/NewWorkoutButton.js';
import ConsistencyCalendar from '../components/ConsistencyCalendar.js';
import { labelColor } from '../utils/labelColor.js';

const PAGE_SIZE = 20;

export default function DashboardPage() {
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

  if (workoutsQuery.isPending || progressionQuery.isPending) {
    return <p className="text-slate-400">Завантаження…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl text-slate-100">Журнал тренувань</h1>
        <NewWorkoutButton
          programs={programs}
          templates={templates}
          busy={startWorkoutMutation.isPending}
          onStart={startWorkout}
        />
      </div>

      {needsAttention.length > 0 && (
        <div className="card border-accent/40">
          <h2 className="mb-3 text-lg text-slate-100">Нагадування про прогресію</h2>
          <ul className="space-y-2">
            {needsAttention.map((p) => (
              <li key={p.exerciseId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-slate-200">{p.name}</span>
                <span className="flex items-center gap-2 text-slate-400">
                  {p.message}
                  <ProgressionBadge suggestion={p.suggestion} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 text-lg text-slate-100">Календар консистентності</h2>
        <ConsistencyCalendar />
      </div>

      <div className="space-y-3">
        {workouts.length === 0 && (
          <p className="text-slate-400">Ще немає жодного тренування. Натисніть «Нове тренування», щоб почати.</p>
        )}
        {workouts.map((w) => {
          const duration = formatDuration(w.timeStart, w.timeEnd);
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
                  <span className="font-semibold text-slate-100">{formatDateUk(w.date)}</span>
                  {w.programLabel && colors && (
                    <span className={`badge ${colors.badgeBg} ${colors.badgeText}`}>{w.programLabel}</span>
                  )}
                </span>
                <span className="text-xs text-slate-400">
                  {duration ?? (w.timeEnd ? '' : 'триває…')}
                </span>
              </div>
              {w.workoutExercises.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Порожньо — додайте вправи</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                  {w.workoutExercises.map((we) => (
                    <li key={we.id}>
                      {we.exercise.name}: {we.sets.length} підх. × {formatTotalWeight(we.weightPerUnitKg, we.weightUnits)}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
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
