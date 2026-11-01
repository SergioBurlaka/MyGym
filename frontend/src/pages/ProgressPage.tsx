import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '../hooks/usePageTitle.js';
import {
  useProgressionHistoryQuery,
  useProgressionQuery,
  useVolumeByCategoryQuery,
} from '../shared/api/progression/index.js';
import ProgressChart from '../components/ProgressChart.js';
import ProgressionBadge from '../components/ProgressionBadge.js';
import WeeklyCategoryChart from '../components/WeeklyCategoryChart.js';
import TryMoreStatusBadge from '../components/TryMoreStatusBadge.js';
import { progressionMessage } from '../utils/progressionMessage.js';
import { tryMoreStatus, tryMoreUrgency } from '../utils/tryMoreCountdown.js';

export default function ProgressPage() {
  const { t } = useTranslation();
  usePageTitle(t('nav.progress'));
  const progressionQuery = useProgressionQuery();
  const volumeByCategoryQuery = useVolumeByCategoryQuery('all');

  // Chips show the same countdown as the program cards (the backend's
  // threshold - smallest across programs, else the category default) and are
  // sorted by urgency, then name, so what needs attention today comes first.
  const chips = useMemo(
    () =>
      (progressionQuery.data ?? [])
        .map((p) => ({ p, status: tryMoreStatus(p, null) }))
        .sort((a, b) => tryMoreUrgency(a.status) - tryMoreUrgency(b.status) || a.p.name.localeCompare(b.p.name)),
    [progressionQuery.data],
  );
  const progression = useMemo(() => chips.map((c) => c.p), [chips]);

  // The default is taken once, from the first load - a refetch that reorders
  // the chips must not swap the charts under someone who hasn't clicked yet.
  const [manualSelectedId, setManualSelectedId] = useState<string | null>(null);
  const [initialSelectedId, setInitialSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (initialSelectedId == null && progression.length > 0) setInitialSelectedId(progression[0].exerciseId);
  }, [initialSelectedId, progression]);
  const defaultSelectedId = initialSelectedId ?? progression[0]?.exerciseId ?? null;
  const selectedId = manualSelectedId ?? defaultSelectedId;

  const historyQuery = useProgressionHistoryQuery(selectedId);
  const history = historyQuery.data ?? [];

  const selected = useMemo(
    () => progression.find((p) => p.exerciseId === selectedId) ?? null,
    [progression, selectedId],
  );

  const weightData = history.map((h) => ({ date: h.date, value: h.totalWeightKg, isPR: h.isWeightPR }));
  const repsData = history.map((h) => ({ date: h.date, value: h.maxReps, isPR: h.isRepsPR }));
  const oneRepMaxData = history.map((h) => ({ date: h.date, value: h.estimatedOneRepMaxKg }));
  const hasWeightedVolume = history.some((h) => h.volumeKg != null);
  const volumeData = history.map((h) => ({
    date: h.date,
    value: hasWeightedVolume ? h.volumeKg : h.totalReps,
  }));
  const volumeUnit = hasWeightedVolume ? t('common.kg') : t('common.reps');

  if (progressionQuery.isPending) return <p className="text-slate-400">{t('common.loading')}</p>;

  return (
    // 12 px side margins on a phone (main has 16) - the chart needs the width.
    <div className="-mx-1 space-y-6 sm:mx-0">
      <h1 className="text-3xl text-slate-100">{t('progress.title')}</h1>

      <div className="card p-3 sm:p-4">
        <h2 className="text-[17px] font-semibold text-slate-100">{t('progress.weeklyVolumeTitle')}</h2>
        <p className="mt-0.5 text-[13px] text-slate-400">{t('progress.weeklyVolumeDescription')}</p>
        <div className="mt-3">
          {volumeByCategoryQuery.isPending ? (
            <p className="text-slate-400">{t('common.loading')}</p>
          ) : (
            <WeeklyCategoryChart data={volumeByCategoryQuery.data ?? []} />
          )}
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-slate-400">{t('progress.exercisesTitle')}</h2>
        <div className="grid grid-cols-2 gap-2">
          {chips.map(({ p, status }) => (
            <button
              key={p.exerciseId}
              onClick={() => setManualSelectedId(p.exerciseId)}
              aria-pressed={selectedId === p.exerciseId}
              className={`flex min-h-[76px] flex-col justify-between gap-2 rounded-xl border p-2.5 text-left transition-colors ${
                selectedId === p.exerciseId
                  ? 'border-accent/70 bg-accent/[0.08]'
                  : 'border-surface-border bg-surface-raised hover:border-slate-600'
              }`}
            >
              <span className="line-clamp-2 text-sm font-semibold leading-snug text-slate-200">{p.name}</span>
              <TryMoreStatusBadge status={status} className="w-full" compact />
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl text-slate-100">{selected.name}</h2>
              <ProgressionBadge suggestion={selected.suggestion} />
            </div>
            <p className="mt-1 text-sm text-slate-400">{progressionMessage(selected, t)}</p>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="label">{t('progress.stats.lastWorkout')}</dt>
                <dd className="text-slate-200">{selected.lastWorkoutDate ?? '—'}</dd>
              </div>
              <div>
                <dt className="label">{t('progress.stats.lastWeight')}</dt>
                <dd className="text-slate-200">
                  {selected.lastTotalWeightKg != null ? `${selected.lastTotalWeightKg} ${t('common.kg')}` : '—'}
                </dd>
              </div>
              <div>
                <dt className="label">{t('progress.stats.maxReps')}</dt>
                <dd className="text-slate-200">{selected.lastMaxReps ?? '—'}</dd>
              </div>
              <div>
                <dt className="label">{t('progress.stats.sessionsWithoutProgress')}</dt>
                <dd className="text-slate-200">
                  {selected.sessionsSinceProgress != null
                    ? `${selected.sessionsSinceProgress} / ${selected.tryMoreAfterWorkouts}`
                    : '—'}
                </dd>
              </div>
            </dl>
          </div>

          {historyQuery.isPending ? (
            <p className="text-slate-400">{t('common.loadingChart')}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="card">
                <h3 className="text-sm uppercase tracking-wide text-slate-400">{t('progress.charts.workingWeightTitle')}</h3>
                <p className="mb-2 mt-1 text-xs text-slate-400">{t('progress.charts.workingWeightDescription')}</p>
                <ProgressChart label={t('progress.charts.workingWeightTitle')} data={weightData} color="#ff5a36" unit={t('common.kg')} emptyLabel={t('progress.charts.workingWeightEmpty')} />
              </div>
              <div className="card">
                <h3 className="text-sm uppercase tracking-wide text-slate-400">{t('progress.charts.maxRepsTitle')}</h3>
                <p className="mb-2 mt-1 text-xs text-slate-400">{t('progress.charts.maxRepsDescription')}</p>
                <ProgressChart label={t('progress.charts.maxRepsTitle')} data={repsData} color="#3ddc97" unit={t('common.reps')} emptyLabel={t('progress.charts.noData')} />
              </div>
              <div className="card">
                <h3 className="text-sm uppercase tracking-wide text-slate-400">{t('progress.charts.oneRepMaxTitle')}</h3>
                <p className="mb-2 mt-1 text-xs text-slate-400">{t('progress.charts.oneRepMaxDescription')}</p>
                <ProgressChart label={t('progress.charts.oneRepMaxTitle')} data={oneRepMaxData} color="#eda100" unit={t('common.kg')} emptyLabel={t('progress.charts.oneRepMaxEmpty')} />
              </div>
              <div className="card">
                <h3 className="text-sm uppercase tracking-wide text-slate-400">{t('progress.charts.volumeTitle')}</h3>
                <p className="mb-2 mt-1 text-xs text-slate-400">
                  {hasWeightedVolume
                    ? t('progress.charts.volumeDescriptionWeighted')
                    : t('progress.charts.volumeDescriptionBodyweight')}
                </p>
                <ProgressChart label={t('progress.charts.volumeTitle')} data={volumeData} color="#7dd3fc" unit={volumeUnit} emptyLabel={t('progress.charts.noData')} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
