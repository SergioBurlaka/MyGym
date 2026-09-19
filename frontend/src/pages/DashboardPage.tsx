import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import type { Workout, ExerciseProgression } from '../types/index.js';
import { formatDateUk, formatDuration, formatTotalWeight } from '../utils/weight.js';
import ProgressionBadge from '../components/ProgressionBadge.js';

const PAGE_SIZE = 20;

export default function DashboardPage() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [progression, setProgression] = useState<ExerciseProgression[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [starting, setStarting] = useState(false);

  async function load() {
    setLoading(true);
    const [workoutsRes, progressionRes] = await Promise.all([
      api.get<Workout[]>('/workouts', { params: { limit: PAGE_SIZE } }),
      api.get<ExerciseProgression[]>('/progression'),
    ]);
    setWorkouts(workoutsRes.data);
    setHasMore(workoutsRes.data.length === PAGE_SIZE);
    setProgression(progressionRes.data);
    setLoading(false);
  }

  async function loadMore() {
    const last = workouts[workouts.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const res = await api.get<Workout[]>('/workouts', {
        params: { limit: PAGE_SIZE, before: last.date },
      });
      setWorkouts((prev) => [...prev, ...res.data]);
      setHasMore(res.data.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function startWorkout() {
    setStarting(true);
    try {
      const res = await api.post<Workout>('/workouts', {});
      navigate(`/workouts/${res.data.id}`);
    } finally {
      setStarting(false);
    }
  }

  const needsAttention = progression.filter(
    (p) => p.suggestion === 'try_more' || p.suggestion === 'increase_weight' || p.suggestion === 'start_adding_weight',
  );

  if (loading) return <p className="text-slate-400">Завантаження…</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl text-slate-100">Журнал тренувань</h1>
        <button className="btn-primary" onClick={startWorkout} disabled={starting}>
          {starting ? 'Створюємо…' : '+ Нове тренування'}
        </button>
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

      <div className="space-y-3">
        {workouts.length === 0 && (
          <p className="text-slate-400">Ще немає жодного тренування. Натисніть «Нове тренування», щоб почати.</p>
        )}
        {workouts.map((w) => {
          const duration = formatDuration(w.timeStart, w.timeEnd);
          return (
            <button
              key={w.id}
              onClick={() => navigate(`/workouts/${w.id}`)}
              className="card block w-full text-left transition-colors hover:border-accent/50"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-100">{formatDateUk(w.date)}</span>
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

      {hasMore && (
        <button className="btn-secondary w-full" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Завантажуємо…' : 'Показати ще'}
        </button>
      )}
    </div>
  );
}
