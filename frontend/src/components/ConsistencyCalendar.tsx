import { useMemo } from 'react';
import { useScheduleHistoryQuery } from '../shared/api/settings/index.js';
import { useWorkoutDatesQuery } from '../shared/api/workouts/index.js';

const WEEKS = 16;
const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

type DayState = 'trained_planned' | 'trained_extra' | 'missed_planned' | 'rest';

const STATE_COLOR: Record<DayState, string> = {
  trained_planned: 'bg-good',
  trained_extra: 'bg-sky-500',
  missed_planned: 'bg-red-500',
  rest: 'bg-surface-border',
};

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return toIso(d);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

function isoWeekday(dateStr: string): number {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export default function ConsistencyCalendar() {
  const historyQuery = useScheduleHistoryQuery();
  // Oldest-first list of {trainingDays, effectiveFrom} - the schedule
  // effective on a given date is the last entry whose effectiveFrom is not
  // after that date, so each past date is judged by the schedule that was
  // actually in effect then, not by whatever the schedule is today.
  const history = historyQuery.data ?? [];

  const { gridStart, gridEnd, todayStr } = useMemo(() => {
    const today = toIso(new Date());
    const currentMonday = mondayOf(today);
    return {
      gridStart: addDays(currentMonday, -7 * (WEEKS - 1)),
      gridEnd: addDays(currentMonday, 6),
      todayStr: today,
    };
  }, []);

  const datesQuery = useWorkoutDatesQuery(gridStart, gridEnd);
  const trainedByDate = useMemo(() => {
    const map = new Map<string, { programLabel: string | null; exerciseNames: string[] }>();
    for (const w of datesQuery.data ?? []) map.set(w.date, w);
    return map;
  }, [datesQuery.data]);

  const weeks = useMemo(() => {
    return Array.from({ length: WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)),
    );
  }, [gridStart]);

  if (historyQuery.isPending || datesQuery.isPending) {
    return <p className="text-slate-400">Завантаження календаря…</p>;
  }

  function scheduleOn(dateStr: string): number[] | null {
    let applicable: number[] | null = null;
    for (const entry of history) {
      if (entry.effectiveFrom > dateStr) break;
      applicable = entry.trainingDays;
    }
    return applicable;
  }

  function stateOf(dateStr: string): DayState {
    if (dateStr > todayStr) return 'rest';
    const trained = trainedByDate.has(dateStr);
    const schedule = scheduleOn(dateStr);
    const planned = schedule != null && schedule.includes(isoWeekday(dateStr));
    if (trained && planned) return 'trained_planned';
    if (trained && !planned) return 'trained_extra';
    if (!trained && planned && dateStr < todayStr) return 'missed_planned';
    return 'rest';
  }

  return (
    <div>
      <div className="flex gap-[3px] pb-2">
        <div className="flex flex-col gap-[3px] pr-1">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="h-3.5 text-[10px] leading-3.5 text-slate-500">
              {label}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((dateStr) => {
              const state = stateOf(dateStr);
              const info = trainedByDate.get(dateStr);
              return (
                <div key={dateStr} className="group relative">
                  <div className={`h-3.5 w-3.5 rounded-sm ${STATE_COLOR[state]}`} />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 hidden w-52 -translate-x-1/2 rounded-lg border border-surface-border bg-surface-raised p-2 text-xs shadow-xl group-hover:block">
                    <p className="text-slate-300">
                      {new Date(`${dateStr}T00:00:00`).toLocaleDateString('uk-UA', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                    {info ? (
                      <p className="mt-1 text-slate-400">
                        {info.programLabel && <span className="text-accent">«{info.programLabel}» — </span>}
                        {info.exerciseNames.join(', ') || 'без вправ'}
                      </p>
                    ) : (
                      <p className="mt-1 text-slate-500">
                        {state === 'missed_planned' ? 'Пропущений плановий день' : 'Без тренування'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-good" /> План виконано
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-sky-500" /> Бонусне тренування
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-red-500" /> Пропущено
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-surface-border" /> Вихідний
        </span>
      </div>
    </div>
  );
}
