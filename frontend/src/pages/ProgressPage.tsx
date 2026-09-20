import { useMemo, useState } from 'react';
import {
  useProgressionHistoryQuery,
  useProgressionQuery,
  useVolumeByCategoryQuery,
} from '../shared/api/progression/index.js';
import ProgressChart from '../components/ProgressChart.js';
import ProgressionBadge from '../components/ProgressionBadge.js';
import WeeklyCategoryChart from '../components/WeeklyCategoryChart.js';

export default function ProgressPage() {
  const progressionQuery = useProgressionQuery();
  const progression = progressionQuery.data ?? [];
  const volumeByCategoryQuery = useVolumeByCategoryQuery(12);

  const [manualSelectedId, setManualSelectedId] = useState<string | null>(null);
  const defaultSelectedId = useMemo(() => {
    const firstWithData = progression.find((p) => p.suggestion !== 'no_data');
    return (firstWithData ?? progression[0])?.exerciseId ?? null;
  }, [progression]);
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
  const volumeUnit = hasWeightedVolume ? 'кг' : 'повт.';

  if (progressionQuery.isPending) return <p className="text-slate-400">Завантаження…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl text-slate-100">Прогрес по вправах</h1>

      <div className="card">
        <h2 className="text-lg text-slate-100">Обсяг по категоріях за тиждень</h2>
        <p className="mt-1 text-sm text-slate-400">
          Баланс навантаження між великими й малими групами м'язів — чи не занедбані малі групи.
        </p>
        <div className="mt-3">
          {volumeByCategoryQuery.isPending ? (
            <p className="text-slate-400">Завантаження…</p>
          ) : (
            <WeeklyCategoryChart data={volumeByCategoryQuery.data ?? []} />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {progression.map((p) => (
          <button
            key={p.exerciseId}
            onClick={() => setManualSelectedId(p.exerciseId)}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              selectedId === p.exerciseId
                ? 'border-accent bg-accent/10'
                : 'border-surface-border bg-surface-raised hover:border-slate-600'
            }`}
          >
            <div className="font-medium text-slate-200">{p.name}</div>
            <ProgressionBadge suggestion={p.suggestion} />
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl text-slate-100">{selected.name}</h2>
              <ProgressionBadge suggestion={selected.suggestion} />
            </div>
            <p className="mt-1 text-sm text-slate-400">{selected.message}</p>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="label">Востаннє</dt>
                <dd className="text-slate-200">{selected.lastWorkoutDate ?? '—'}</dd>
              </div>
              <div>
                <dt className="label">Остання вага</dt>
                <dd className="text-slate-200">
                  {selected.lastTotalWeightKg != null ? `${selected.lastTotalWeightKg} кг` : '—'}
                </dd>
              </div>
              <div>
                <dt className="label">Макс. повторень</dt>
                <dd className="text-slate-200">{selected.lastMaxReps ?? '—'}</dd>
              </div>
              <div>
                <dt className="label">Без прогресу, днів</dt>
                <dd className="text-slate-200">{selected.daysSinceProgress ?? '—'}</dd>
              </div>
            </dl>
          </div>

          {historyQuery.isPending ? (
            <p className="text-slate-400">Завантаження графіка…</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="card">
                <h3 className="text-sm uppercase tracking-wide text-slate-400">Робоча вага, кг</h3>
                <p className="mb-2 mt-1 text-xs text-slate-500">
                  Вага, з якою виконувалась вправа в цьому тренуванні — фіксована на всю вправу й
                  не змінюється між підходами. Більша точка з обвідкою — особистий рекорд ваги.
                </p>
                <ProgressChart data={weightData} color="#ff5a36" unit="кг" emptyLabel="Ця вправа виконується без ваги" />
              </div>
              <div className="card">
                <h3 className="text-sm uppercase tracking-wide text-slate-400">Максимум повторень за тренування</h3>
                <p className="mb-2 mt-1 text-xs text-slate-500">
                  Найбільша кількість повторень серед усіх підходів цього тренування (не сума й не
                  середнє). Більша точка з обвідкою — особистий рекорд повторень.
                </p>
                <ProgressChart data={repsData} color="#3ddc97" unit="повт." emptyLabel="Немає даних" />
              </div>
              <div className="card">
                <h3 className="text-sm uppercase tracking-wide text-slate-400">Розрахунковий 1ПМ, кг</h3>
                <p className="mb-2 mt-1 text-xs text-slate-500">
                  Одноповторний максимум — скільки ти теоретично міг(-ла) би підняти на 1 повторення,
                  за формулою Еплі: вага × (1 + повторення / 30). Об'єднує вагу й повторення в одну
                  метрику сили, тому росте, навіть коли вагу знизили заради більшої кількості
                  повторень. Орієнтовний показник — на 15+ повтореннях формула стає ненадійною.
                </p>
                <ProgressChart data={oneRepMaxData} color="#eda100" unit="кг" emptyLabel="Ця вправа без ваги" />
              </div>
              <div className="card">
                <h3 className="text-sm uppercase tracking-wide text-slate-400">Обсяг тренування</h3>
                <p className="mb-2 mt-1 text-xs text-slate-500">
                  {hasWeightedVolume
                    ? "Сумарна робота за сесію: вага × сума повторень усіх підходів. Росте навіть коли вага й максимум повторень не змінюються — за рахунок більшої кількості підходів."
                    : 'Для вправ без ваги — просто сума повторень усіх підходів за сесію.'}
                </p>
                <ProgressChart data={volumeData} color="#7dd3fc" unit={volumeUnit} emptyLabel="Немає даних" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
