import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Exercise, ExerciseProgression, PreviousSession, WorkoutExercise } from '../types/index.js';
import { formatDate, lastRepsForSet, loadPerRep, parseKg, sidesOf } from '../utils/weight.js';
import { journalTryMoreStatus, type TryMoreStatus } from '../utils/tryMoreCountdown.js';
import { progressionMessage } from '../utils/progressionMessage.js';
import ProgressionBadge from './ProgressionBadge.js';
import TryMoreStatusBadge from './TryMoreStatusBadge.js';
import EquipmentIcon from './EquipmentIcon.js';
import Popconfirm from './Popconfirm.js';
import ConfirmDialog from './ConfirmDialog.js';
import Select from './Select.js';

// `key`: a client-only id, stable while sets around it come and go - an
// index key would shift cells under the person's finger when one is removed.
// An empty `reps` is a set not done yet: it shows last time's value as a
// placeholder and is never saved.
export type EditableSet = { key: string; reps: string };

export type EditableExercise = {
  exerciseId: string;
  weightPerUnitKg: string; // '' = bodyweight / no external load
  weightUnits: 1 | 2; // dumbbells moving in one rep (a barbell is always 2 sides)
  barKg: string; // barbell only: the bar used today
  sets: EditableSet[];
};

// Bars offered in the "Bar" select; another stored value is shown as its own option.
const BAR_OPTIONS = ['20', '15', '10', '0'] as const;

// A long press, not a "−" button, removes a set (user's decision 2026-10-29):
// the 4-wide grid has no room for a 44px target per cell, and a mis-tap in
// the gym shouldn't delete anything.
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;

function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = useRef<{ x: number; y: number } | null>(null);
  function cancel() {
    clearTimeout(timer.current);
    start.current = null;
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    onPointerDown(e: React.PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        start.current = null;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove(e: React.PointerEvent) {
      // A scroll that started on a cell is not a press.
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > LONG_PRESS_SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    // Android fires this on a long press too, a mouse on right click.
    onContextMenu(e: React.MouseEvent) {
      e.preventDefault();
      cancel();
      onLongPress();
    },
  };
}

function useKg() {
  const { i18n } = useTranslation();
  const format = new Intl.NumberFormat(i18n.language?.startsWith('uk') ? 'uk-UA' : 'en-US', { maximumFractionDigits: 2 });
  return (n: number) => format.format(n);
}

function SetCell({
  index,
  set,
  placeholder,
  up,
  label,
  describedBy,
  onChange,
  onCommit,
  onRemove,
}: {
  index: number;
  set: EditableSet;
  placeholder: number | null;
  up: boolean;
  label: string;
  describedBy: string;
  onChange: (reps: string) => void;
  onCommit: () => void;
  onRemove: () => void;
}) {
  const press = useLongPress(onRemove);
  return (
    <div className="relative" {...press}>
      <input
        type="text"
        inputMode="numeric"
        className={`h-14 w-full rounded-lg border border-surface-border bg-surface text-center text-lg font-bold tabular-nums text-slate-100 focus:border-accent focus:outline-none ${
          up ? 'placeholder:font-semibold placeholder:text-target' : 'placeholder:font-medium placeholder:text-hint'
        }`}
        aria-label={label}
        aria-describedby={describedBy}
        placeholder={placeholder != null ? String(placeholder) : ''}
        value={set.reps}
        onClick={(e) => {
          // Tap = "same as last time" (or the target): one tap per set. On
          // click, not focus: a long press / right click (the delete gesture)
          // and Tab focus a cell too, and must not log a set.
          if (set.reps === '' && placeholder != null) {
            onChange(String(placeholder));
            const input = e.currentTarget;
            setTimeout(() => input.select(), 0);
          }
        }}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
      />
      <span className="pointer-events-none absolute left-1.5 top-1 text-xs text-hint" aria-hidden="true">
        {index + 1}
      </span>
      {up && (
        <span className="pointer-events-none absolute right-1.5 top-1 text-xs font-bold text-target" aria-hidden="true">
          ↑
        </span>
      )}
    </div>
  );
}

export default function WorkoutExerciseCard({
  block,
  exercise,
  progression,
  saved,
  onChange,
  onCommit,
  onAddSet,
  onRemoveSet,
  onRemove,
}: {
  block: EditableExercise;
  exercise: Exercise;
  // From the overview: "Try more" / "On track"... as of today.
  progression: ExerciseProgression | undefined;
  // This exercise as last saved: the counter after this workout, last time and the +1 target.
  saved: WorkoutExercise | undefined;
  onChange: (patch: Partial<EditableExercise>) => void;
  // A field lost focus or a select changed - autosave.
  onCommit: () => void;
  onAddSet: () => void;
  onRemoveSet: (setKey: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const kg = useKg();
  const hintId = useId();
  const [removingSet, setRemovingSet] = useState<number | null>(null);

  const previous: PreviousSession | null = saved?.previous ?? null;
  const target = saved?.target ?? null;
  const lastReps = previous?.reps ?? [];
  const sides = sidesOf(exercise.unilateral);
  const limb = exercise.unilateral ? (exercise.limb ?? 'side') : null;
  const isBarbell = exercise.equipment === 'barbell';
  const isDumbbell = exercise.equipment === 'dumbbell';
  const hasWeight = block.weightPerUnitKg.trim() !== '';

  const categoryLabel = t(`exercises.category.${exercise.category}`);
  const equipLabel = isBarbell
    ? t('workout.card.equipBarbell')
    : isDumbbell
      ? t(block.weightUnits === 1 ? 'workout.card.equipDumbbell1' : 'workout.card.equipDumbbell2')
      : t('workout.card.equipBodyweight');
  const limbsLabel = t(limb ? `workout.card.limbs.${limb}` : 'workout.card.limbs.together');

  const load = hasWeight
    ? loadPerRep(exercise.equipment, {
        weightPerUnitKg: block.weightPerUnitKg,
        weightUnits: block.weightUnits,
        barKg: block.barKg,
      })
    : null;
  const weight = parseKg(block.weightPerUnitKg);
  let loadLine: string | null = null;
  if (load != null && Number.isFinite(load)) {
    if (isBarbell) loadLine = t('workout.card.loadBarbell', { bar: kg(Number(block.barKg)), plates: kg(weight), total: kg(load) });
    else if (isDumbbell)
      loadLine = block.weightUnits === 2
        ? t('workout.card.loadDumbbell2', { weight: kg(weight), total: kg(load) })
        : t('workout.card.loadDumbbell1', { weight: kg(weight) });
    else loadLine = load > 0 ? t('workout.card.loadBodyweightExtra', { weight: kg(load) }) : t('workout.card.loadBodyweightOnly');
  } else if (!isBarbell && !isDumbbell) {
    loadLine = t('workout.card.loadBodyweightOnly');
  }

  // Last time's weight as the weight field's placeholder; a tap fills it in
  // with the bar / dumbbells of that session.
  const previousWeight = previous?.weightPerUnitKg ?? null;
  const weightPlaceholder = previousWeight != null ? kg(previousWeight) : isBarbell || isDumbbell ? '0' : t('workout.weightPlaceholderNoWeight');
  function fillWeightFromPrevious(input: HTMLInputElement) {
    if (hasWeight || previousWeight == null) return;
    onChange({
      weightPerUnitKg: String(previousWeight),
      ...(previous?.weightUnits === 1 || previous?.weightUnits === 2 ? { weightUnits: previous.weightUnits } : {}),
      ...(previous?.barKg != null ? { barKg: String(Number(previous.barKg)) } : {}),
    });
    setTimeout(() => input.select(), 0);
  }

  function placeholderFor(i: number): { value: number | null; up: boolean } {
    if (target && i < target.reps.length) return { value: target.reps[i], up: i === target.upSetIndex };
    return { value: lastRepsForSet(lastReps, i), up: false };
  }

  // Only sets typed in count - a placeholder is not a set done.
  const totalReps = block.sets
    .map((s) => (s.reps.trim() === '' ? 0 : Number(s.reps)))
    .filter((r) => Number.isFinite(r) && r > 0)
    .reduce((a, b) => a + b, 0);
  let volumeLine = '—';
  if (totalReps > 0) {
    if (load != null && load > 0) {
      volumeLine = sides === 2
        ? t('workout.card.volumeSides', { load: kg(load), reps: totalReps, limbs: t(`workout.card.limbsPlural.${limb}`), total: kg(load * totalReps * 2) })
        : t('workout.card.volume', { load: kg(load), reps: totalReps, total: kg(load * totalReps) });
    } else {
      volumeLine = t('workout.card.volumeReps', { count: totalReps * sides });
    }
  }

  const repsSuffix = limb ? t(`workout.card.perLimb.${limb}`) : '';
  const lastLine = previous
    ? t('workout.card.lastTime', {
        date: formatDate(previous.date, { day: '2-digit', month: '2-digit' }),
        reps: previous.reps.join(' / '),
        perLimb: repsSuffix ? ` ${repsSuffix}` : '',
      }) + (target ? t('workout.card.targetSuffix', { set: target.upSetIndex + 1 }) : '')
    : null;

  const barOptions = BAR_OPTIONS.includes(block.barKg as (typeof BAR_OPTIONS)[number]) ? BAR_OPTIONS : [...BAR_OPTIONS, block.barKg];
  // The counter bar is always there (user's decision 2026-10-29) and shows
  // the state as of the last session until today has as many sets done as
  // last time - only then today's (a half-done exercise is neither progress
  // nor a stall yet). The status words ("✓ Progress"...) switch with it.
  const todayCounts = saved?.progressAt != null && saved.sets.length >= (previous?.reps.length || 1);
  const tryMore = todayCounts ? journalTryMoreStatus(saved?.progressAt) : ({ kind: 'unknown' } as const);
  const showStatusChip = tryMore.kind !== 'unknown' && tryMore.kind !== 'countdown' && tryMore.kind !== 'due';
  const counter = counterStatus(todayCounts ? saved?.progressAt : saved?.counterBefore);

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-surface-border bg-surface-raised p-4">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-xl font-bold leading-tight text-slate-100">{exercise.name}</h2>
          <div className="flex flex-wrap gap-1.5">
            <span className="badge bg-surface-border text-slate-300">
              {categoryLabel} · {exercise.repRangeMin}–{exercise.repRangeMax}
            </span>
            {progression && (
              <ProgressionBadge suggestion={progression.suggestion} title={progressionMessage(progression, t)} />
            )}
            {showStatusChip && <TryMoreStatusBadge status={tryMore} />}
          </div>
        </div>
        <Popconfirm
          title={t('workout.removeExerciseConfirmTitle')}
          description={t('workout.removeExerciseConfirmDescription', { name: exercise.name })}
          confirmText={t('workout.removeExerciseConfirmText')}
          onConfirm={onRemove}
        >
          <button
            type="button"
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-surface-border hover:text-red-400"
            aria-label={t('workout.card.removeExerciseAria')}
            title={t('workout.card.removeExerciseAria')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            </svg>
          </button>
        </Popconfirm>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
        <EquipmentIcon equipment={exercise.equipment} units={block.weightUnits} filled size={18} className="text-accent" />
        <span className="font-semibold text-slate-100">{equipLabel}</span>
        <span className="text-hint" aria-hidden="true">·</span>
        <span className={`font-semibold ${limb ? 'text-warn' : 'text-slate-300'}`}>{limbsLabel}</span>
      </div>

      {counter && <TryMoreStatusBadge status={counter} className="w-full" />}

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-3">
          <span className="flex-1 text-sm text-slate-400">
            {isBarbell ? t('workout.platesPerSideLabel') : isDumbbell ? t('workout.dumbbellWeightLabel') : t('workout.extraWeightLabel')}
          </span>
          <input
            type="text"
            inputMode="decimal"
            className="h-11 w-32 rounded-lg border border-surface-border bg-surface text-center text-base font-bold tabular-nums text-slate-100 placeholder:font-medium placeholder:text-hint focus:border-accent focus:outline-none"
            placeholder={weightPlaceholder}
            value={block.weightPerUnitKg}
            onClick={(e) => fillWeightFromPrevious(e.currentTarget)}
            onChange={(e) => onChange({ weightPerUnitKg: e.target.value })}
            onBlur={onCommit}
          />
        </label>
        {/* Without a weight nothing is saved, the bar and dumbbells included - so no selects. */}
        {isBarbell && hasWeight && (
          <div className="flex items-center gap-3">
            <span className="flex-1 text-sm text-slate-400">{t('workout.barLabel')}</span>
            <Select
              className="w-32"
              value={block.barKg}
              onChange={(v) => {
                onChange({ barKg: v });
                onCommit();
              }}
              options={barOptions.map((value) => ({ value, label: barLabel(value, t) }))}
            />
          </div>
        )}
        {isDumbbell && hasWeight && (
          <div className="flex items-center gap-3">
            <span className="flex-1 text-sm text-slate-400">{t('workout.dumbbellsPerRepLabel')}</span>
            <Select
              className="w-32"
              value={String(block.weightUnits)}
              onChange={(v) => {
                onChange({ weightUnits: Number(v) as 1 | 2 });
                onCommit();
              }}
              options={[
                { value: '1', label: '1' },
                { value: '2', label: '2' },
              ]}
            />
          </div>
        )}
        {loadLine && <span className="text-right text-sm tabular-nums text-slate-300">{loadLine}</span>}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-400">
          {t(limb ? `workout.card.setsLabel.${limb}` : 'workout.card.setsLabel.together')}
        </span>
        <span id={hintId} className="sr-only">
          {t('workout.card.removeSetHint')}
        </span>
        <div className="grid grid-cols-4 gap-2">
          {block.sets.map((s, i) => {
            const ph = placeholderFor(i);
            return (
              <SetCell
                key={s.key}
                index={i}
                set={s}
                placeholder={ph.value}
                up={ph.up}
                label={t('workout.card.setAria', {
                  set: i + 1,
                  perLimb: repsSuffix ? ` ${repsSuffix}` : '',
                  last: ph.value ?? '—',
                })}
                describedBy={hintId}
                onChange={(reps) => onChange({ sets: block.sets.map((x) => (x.key === s.key ? { ...x, reps } : x)) })}
                onCommit={onCommit}
                onRemove={() => setRemovingSet(i)}
              />
            );
          })}
          <button
            type="button"
            className="flex h-14 items-center justify-center rounded-lg border border-dashed border-accent-muted text-accent hover:bg-accent/10"
            aria-label={t('workout.card.addSetAria')}
            onClick={onAddSet}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        {lastLine && <span className="text-xs text-hint">{lastLine}</span>}
        <div className="flex justify-between gap-2 border-t border-surface-border pt-3 text-sm">
          <span className="shrink-0 text-slate-400">{t('workout.card.volumeTitle')}</span>
          <span className="text-right font-semibold tabular-nums text-slate-100">{volumeLine}</span>
        </div>
      </div>

      <ConfirmDialog
        open={removingSet != null}
        title={t('workout.card.removeSetTitle', { set: (removingSet ?? 0) + 1 })}
        description={t('workout.card.removeSetDescription')}
        confirmText={t('workout.card.removeSetConfirm')}
        onCancel={() => setRemovingSet(null)}
        onConfirm={() => {
          const set = removingSet != null ? block.sets[removingSet] : undefined;
          setRemovingSet(null);
          if (set) onRemoveSet(set.key);
        }}
      />
    </article>
  );
}

// The counter bar for one state (today's or the last session's). Null for
// an exercise not saved yet.
function counterStatus(
  state: { sessionsSinceProgress: number; tryMoreAfterWorkouts: number } | null | undefined,
): TryMoreStatus | null {
  if (!state) return null;
  const total = state.tryMoreAfterWorkouts;
  const done = state.sessionsSinceProgress;
  return done >= total ? { kind: 'due', done, total } : { kind: 'countdown', done, total, left: total - done };
}

// "20 kg" / "EZ 10 kg" / "No bar" for the bar select.
function barLabel(value: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (value === '0') return t('workout.barNone');
  if (value === '10') return t('workout.barEz', { kg: value });
  return t('workout.barKg', { kg: value });
}
