import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useExercisesQuery } from '../shared/api/exercises/index.js';
import { useProgressionQuery } from '../shared/api/progression/index.js';
import {
  useDeleteWorkoutMutation,
  useFinishWorkoutMutation,
  useSaveWorkoutExercisesMutation,
  useUpdateWorkoutMutation,
  useWorkoutDatesQuery,
  useWorkoutQuery,
} from '../shared/api/workouts/index.js';
import { useCreateProgramMutation, useProgramsQuery } from '../shared/api/programs/index.js';
import { formatDate, formatDuration, parseKg } from '../utils/weight.js';
import { translateApiError } from '../utils/apiError.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import ConfirmDialog from '../components/ConfirmDialog.js';
import DatePicker from '../components/DatePicker.js';
import Select from '../components/Select.js';
import WorkoutExerciseCard, { type EditableExercise, type EditableSet } from '../components/WorkoutExerciseCard.js';
import type { WorkoutExercise } from '../types/index.js';

// A failed autosave is retried after these pauses, then every 30 s until it
// goes through - the network in a gym can be gone for minutes. Also on
// `online` and "Retry".
const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];

let setKeySeq = 0;
function newSet(reps = ''): EditableSet {
  setKeySeq += 1;
  return { key: `set-${setKeySeq}`, reps };
}

// "20.00" -> "20", so a stored bar compares equal to a select value.
function barString(value: string | number | null | undefined): string {
  return value == null ? '20' : String(Number(value));
}

// What gets saved: only sets with reps typed in (an empty cell is a set not
// done yet), renumbered. An exercise with none is saved alone - in the
// workout, not done. A weight that isn't a number makes the whole form
// unsavable (hasInvalidWeight) - sending it would save "no weight".
function buildPayload(source: EditableExercise[]) {
  return {
    exercises: source.map((b) => ({
      exerciseId: b.exerciseId,
      weightPerUnitKg: b.weightPerUnitKg.trim() === '' ? null : parseKg(b.weightPerUnitKg),
      weightUnits: b.weightPerUnitKg.trim() === '' ? null : b.weightUnits,
      // The server keeps it for a barbell only.
      barKg: b.weightPerUnitKg.trim() === '' ? null : Number(b.barKg),
      sets: b.sets
        .filter((s) => s.reps.trim() !== '')
        .map((s, i) => ({ setNumber: i + 1, reps: Number(s.reps) }))
        .filter((s) => Number.isFinite(s.reps) && s.reps >= 0),
    })),
  };
}

function hasInvalidWeight(source: EditableExercise[]): boolean {
  return source.some((b) => b.weightPerUnitKg.trim() !== '' && !Number.isFinite(parseKg(b.weightPerUnitKg)));
}

// The saved sets, then empty cells up to the planned count: the program's
// targetSets, else as many as last time, else one. A finished workout gets
// no extra cells - one stray tap would add a set to the history.
function editableBlock(we: WorkoutExercise, targetSets: number | undefined, finished = false): EditableExercise {
  const saved = [...we.sets].sort((a, b) => a.setNumber - b.setNumber).map((s) => newSet(String(s.reps)));
  const planned = finished ? 1 : (targetSets ?? (we.previous?.reps.length || 1));
  while (saved.length < planned) saved.push(newSet());
  return {
    exerciseId: we.exerciseId,
    // A string for the input; the API sends nested numerics as numbers.
    weightPerUnitKg: we.weightPerUnitKg == null ? '' : String(Number(we.weightPerUnitKg)),
    weightUnits: (we.weightUnits as 1 | 2) ?? 2,
    barKg: barString(we.barKg ?? we.exercise.defaultBarKg),
    sets: saved,
  };
}

export default function WorkoutFormPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const workoutQuery = useWorkoutQuery(id);
  const exercisesQuery = useExercisesQuery();
  const progressionQuery = useProgressionQuery();
  const programsQuery = useProgramsQuery();

  const saveMutation = useSaveWorkoutExercisesMutation(id ?? '');
  const finishMutation = useFinishWorkoutMutation(id ?? '');
  const deleteMutation = useDeleteWorkoutMutation(id ?? '');
  const updateMutation = useUpdateWorkoutMutation(id ?? '');
  const createProgramMutation = useCreateProgramMutation();

  const exercises = exercisesQuery.data ?? [];
  const progression = progressionQuery.data ?? [];

  // The screen stays on while the workout is running - not once it is
  // finished (also by the 90-min auto-finish) and not while it is paused.
  const workoutRunning = workoutQuery.data != null && workoutQuery.data.timeEnd == null;
  const workoutPaused = workoutRunning && workoutQuery.data?.pausedAt != null;
  const wakeLock = useWakeLock(workoutRunning && !workoutPaused);

  // The tab names the workout: "30 October · B · MyGym" (date, then its label).
  const titleDate = workoutQuery.data ? formatDate(workoutQuery.data.date, { day: 'numeric', month: 'long' }) : null;
  usePageTitle(titleDate && [titleDate, workoutQuery.data?.programLabel].filter(Boolean).join(' · '));

  const [blocks, setBlocks] = useState<EditableExercise[]>([]);
  // null until the form is seeded from the server - nothing may be saved
  // before that (an empty form would replace the workout's exercises).
  const [savedJson, setSavedJson] = useState<string | null>(null);
  const [addExerciseId, setAddExerciseId] = useState('');
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The last autosave failed (network, server) - retried by itself; a bad
  // weight in the form is `error` without this, nothing to retry.
  const [saveFailed, setSaveFailed] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const [dateDraft, setDateDraft] = useState('');
  // The date picker's dots: workout days in the 6 weeks it shows (it reports
  // the range), plus this workout's own day - /dates lists only workouts
  // with something logged, and this one may have nothing yet.
  const [datesRange, setDatesRange] = useState<{ from: string; to: string } | null>(null);
  const datesQuery = useWorkoutDatesQuery(datesRange?.from ?? '', datesRange?.to ?? '', datesRange !== null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saveAsProgramOpen, setSaveAsProgramOpen] = useState(false);
  const [newProgramName, setNewProgramName] = useState('');
  const [saveAsProgramError, setSaveAsProgramError] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  // Exercises added by hand: their last session (weight, set count) is known
  // only once the server answers the first save - filled in then, once.
  const seedFromPreviousRef = useRef(new Set<string>());

  // The "⋯" menu and the save-as-program popover close on outside click / Escape.
  useEffect(() => {
    if (!menuOpen && !saveAsProgramOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setSaveAsProgramOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setSaveAsProgramOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen, saveAsProgramOpen]);

  const workoutProgram = programsQuery.data?.find((p) => p.id === workoutQuery.data?.programId);
  const targetSetsById = useMemo(
    () => new Map((workoutProgram?.programExercises ?? []).map((pe) => [pe.exerciseId, pe.targetSets])),
    [workoutProgram],
  );
  // Exercises whose set count the program fixes: no adding or removing sets.
  const lockedSetsIds = useMemo(
    () => new Set((workoutProgram?.programExercises ?? []).filter((pe) => pe.lockSets).map((pe) => pe.exerciseId)),
    [workoutProgram],
  );

  // Seed the local edit state once per workout - not on every cache update
  // a save/finish triggers for this same id - and only once programs are in
  // (they size the placeholder rows).
  const seededForRef = useRef<string | null>(null);
  useEffect(() => {
    const workout = workoutQuery.data;
    if (!workout || programsQuery.isPending || seededForRef.current === workout.id) return;
    seededForRef.current = workout.id;
    const initial = workout.workoutExercises.map((we) =>
      editableBlock(we, targetSetsById.get(we.exerciseId), workout.timeEnd != null),
    );
    setBlocks(initial);
    setSavedJson(JSON.stringify(buildPayload(initial)));
    setLabelDraft(workout.programLabel ?? '');
    setDateDraft(workout.date);
  }, [workoutQuery.data, programsQuery.isPending, targetSetsById]);

  const markedDates = useMemo(() => {
    const days = new Set((datesRange ? (datesQuery.data ?? []) : []).map((d) => d.date));
    if (workoutQuery.data) days.add(workoutQuery.data.date);
    return days;
  }, [datesRange, datesQuery.data, workoutQuery.data]);

  const savedById = useMemo(
    () => new Map((workoutQuery.data?.workoutExercises ?? []).map((we) => [we.exerciseId, we])),
    [workoutQuery.data],
  );

  // A hand-added exercise, once saved: take last time's weight and set count
  // if nothing has been typed into it yet (the weight is a real value, not a
  // placeholder - an empty one would save the exercise as "no weight").
  useEffect(() => {
    const pending = seedFromPreviousRef.current;
    if (pending.size === 0) return;
    let changed = false;
    const next = blocks.map((b) => {
      const we = savedById.get(b.exerciseId);
      if (!pending.has(b.exerciseId) || !we) return b;
      pending.delete(b.exerciseId);
      const untouched = b.weightPerUnitKg === '' && b.sets.every((s) => s.reps === '');
      if (!untouched || !we.previous) return b;
      changed = true;
      const seeded = editableBlock({ ...we, sets: [] }, undefined);
      const prev = we.previous;
      return {
        ...seeded,
        weightPerUnitKg: prev.weightPerUnitKg != null ? String(prev.weightPerUnitKg) : '',
        weightUnits: prev.weightUnits === 1 ? (1 as const) : (2 as const),
        barKg: prev.barKg != null ? barString(prev.barKg) : seeded.barKg,
      };
    });
    if (changed) {
      setBlocks(next);
      requestSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedById]);

  function commitLabel() {
    const trimmed = labelDraft.trim();
    if (trimmed === (workoutQuery.data?.programLabel ?? '')) return;
    updateMutation.mutate({ programLabel: trimmed === '' ? null : trimmed });
  }

  function commitDate(value: string) {
    setDateDraft(value);
    const saved = workoutQuery.data?.date;
    if (!value || value === saved) return;
    // A failed save puts the saved date back - the picker applies a day in
    // one tap, so it mustn't keep showing one the server never got.
    updateMutation.mutate({ date: value }, { onError: () => saved && setDateDraft(saved) });
  }

  const dirty = useMemo(
    () => savedJson !== null && JSON.stringify(buildPayload(blocks)) !== savedJson,
    [blocks, savedJson],
  );

  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const progressionByExerciseId = useMemo(
    () => new Map(progression.map((p) => [p.exerciseId, p])),
    [progression],
  );
  const usedIds = useMemo(() => new Set(blocks.map((b) => b.exerciseId)), [blocks]);
  const availableExercises = exercises.filter((e) => !usedIds.has(e.id));

  function addExercise() {
    if (!addExerciseId) return;
    const barKg = barString(exerciseById.get(addExerciseId)?.defaultBarKg);
    seedFromPreviousRef.current.add(addExerciseId);
    setBlocks((prev) => [
      ...prev,
      { exerciseId: addExerciseId, weightPerUnitKg: '', weightUnits: 2, barKg, sets: [newSet()] },
    ]);
    setAddExerciseId('');
    setAddPickerOpen(false);
    requestSave();
  }

  function removeExercise(exerciseId: string) {
    setBlocks((prev) => prev.filter((b) => b.exerciseId !== exerciseId));
    requestSave();
  }

  function updateBlock(exerciseId: string, patch: Partial<EditableExercise>) {
    setBlocks((prev) => prev.map((b) => (b.exerciseId === exerciseId ? { ...b, ...patch } : b)));
  }

  function addSet(exerciseId: string) {
    if (lockedSetsIds.has(exerciseId)) return;
    setBlocks((prev) =>
      prev.map((b) => (b.exerciseId === exerciseId ? { ...b, sets: [...b.sets, newSet()] } : b)),
    );
  }

  function removeSet(exerciseId: string, setKey: string) {
    if (lockedSetsIds.has(exerciseId)) return;
    setBlocks((prev) =>
      prev.map((b) => (b.exerciseId === exerciseId ? { ...b, sets: b.sets.filter((s) => s.key !== setKey) } : b)),
    );
    requestSave();
  }

  // Autosave: blur on a reps/weight input, or any structural change (add/remove
  // set or exercise, a select), requests a save. Saves run strictly one after
  // another - the backend replaces all of a workout's exercises in one
  // delete+insert transaction, so two in flight at once could interleave.
  // A request made while a save is running just marks `pending`; the running
  // loop then saves again with the latest blocks.
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const savedJsonRef = useRef(savedJson);
  savedJsonRef.current = savedJson;
  const saveLoopRef = useRef<Promise<void> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const retryAttemptRef = useRef(0);
  const deletedRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const [saveTick, setSaveTick] = useState(0);

  function requestSave() {
    setSaveTick((n) => n + 1);
  }

  // Runs after the render that applied the triggering edit, so blocksRef
  // already holds it (a structural change calls setBlocks + requestSave).
  useEffect(() => {
    if (saveTick > 0) void flushSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveTick]);

  // Leaving the page (navbar link, back) with an unsaved edit still saves it.
  // Only refs are read, so the mount-time closure is fine; the mutation keeps
  // running after unmount.
  useEffect(
    () => () => {
      if (!deletedRef.current) void flushSave();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function flushSave(): Promise<void> {
    pendingSaveRef.current = true;
    if (!saveLoopRef.current) {
      saveLoopRef.current = (async () => {
        while (pendingSaveRef.current) {
          pendingSaveRef.current = false;
          await saveOnce();
        }
      })().finally(() => {
        saveLoopRef.current = null;
      });
    }
    return saveLoopRef.current;
  }

  async function saveOnce() {
    // Not seeded yet (e.g. StrictMode's mount-unmount in dev runs the
    // leave-the-page save before the first data arrives).
    if (savedJsonRef.current === null) return;
    if (hasInvalidWeight(blocksRef.current)) {
      setError(t('workout.invalidWeightError'));
      return;
    }
    const payload = buildPayload(blocksRef.current);
    const json = JSON.stringify(payload);
    if (json === savedJsonRef.current) {
      setError(null);
      return;
    }
    clearTimeout(retryTimerRef.current);
    try {
      await saveMutation.mutateAsync(payload);
      savedJsonRef.current = json;
      setSavedJson(json);
      setError(null);
      setSaveFailed(false);
      retryAttemptRef.current = 0;
    } catch (err) {
      setError(translateApiError(err, t, 'workout.genericSaveError'));
      setSaveFailed(true);
      // Bad network in the gym: try again by itself a few times, and once
      // more when the phone is back online (below). "Retry" is still there.
      if (!deletedRef.current) {
        const delay = RETRY_DELAYS_MS[Math.min(retryAttemptRef.current, RETRY_DELAYS_MS.length - 1)];
        retryAttemptRef.current += 1;
        retryTimerRef.current = setTimeout(() => void flushSave(), delay);
      }
    }
  }

  function retrySave() {
    retryAttemptRef.current = 0;
    void flushSave();
  }

  useEffect(() => {
    if (!saveFailed) return;
    function onOnline() {
      retrySave();
    }
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveFailed]);

  useEffect(() => () => clearTimeout(retryTimerRef.current), []);

  async function handleFinish() {
    await flushSave();
    await finishMutation.mutateAsync();
  }

  async function handleDelete() {
    setDeleteOpen(false);
    await deleteMutation.mutateAsync();
    // Nothing left to save into - skip the leave-the-page save on unmount.
    deletedRef.current = true;
    navigate('/');
  }

  function openSaveAsProgram() {
    setMenuOpen(false);
    setNewProgramName(labelDraft.trim() || workoutQuery.data?.program?.name || '');
    setSaveAsProgramError(null);
    setSaveAsProgramOpen(true);
  }

  async function handleSaveAsProgram() {
    const trimmedName = newProgramName.trim();
    if (!trimmedName) {
      setSaveAsProgramError(t('workout.saveAsProgramErrorNameRequired'));
      return;
    }
    // targetSets = how many set cells this exercise has now, done or not -
    // a workout started from this program shows that many.
    const programExercises = blocks
      .filter((b) => b.sets.length > 0)
      .map((b) => ({ exerciseId: b.exerciseId, targetSets: b.sets.length }));
    if (programExercises.length === 0) {
      setSaveAsProgramError(t('workout.saveAsProgramErrorNoExercises'));
      return;
    }

    try {
      await createProgramMutation.mutateAsync({ name: trimmedName, exercises: programExercises });
      setSaveAsProgramOpen(false);
    } catch (err) {
      setSaveAsProgramError(translateApiError(err, t, 'workout.saveAsProgramErrorGeneric'));
    }
  }

  if (
    workoutQuery.isPending ||
    exercisesQuery.isPending ||
    progressionQuery.isPending ||
    programsQuery.isPending ||
    !workoutQuery.data
  ) {
    return <p className="text-slate-400">{t('common.loading')}</p>;
  }

  const workout = workoutQuery.data;
  const saving = saveMutation.isPending || finishMutation.isPending;
  const duration = formatDuration(workout.timeStart, workout.timeEnd, workout.autoFinished, workout.pausedMs);
  const hasPrevious = workout.workoutExercises.some((we) => we.previous);

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            {/* Any date, past or future (task date-picker.md) - no `max`. */}
            <DatePicker
              value={dateDraft || workout.date}
              onChange={commitDate}
              ariaLabel={t('workout.dateLabel')}
              markedDates={markedDates}
              onVisibleRangeChange={(from, to) => setDatesRange({ from, to })}
            />
            <span className="flex-1" />
            <div className="relative" ref={actionsRef}>
              <button
                type="button"
                className={`flex h-11 w-11 items-center justify-center rounded-lg border border-surface-border text-slate-100 ${
                  menuOpen ? 'bg-surface-border' : 'bg-surface-raised'
                }`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={t('workout.moreActions')}
                onClick={() => {
                  setSaveAsProgramOpen(false);
                  setMenuOpen((open) => !open);
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  aria-label={t('workout.actionsMenu')}
                  className="absolute right-0 top-12 z-20 flex w-64 animate-pop-in flex-col rounded-xl border border-surface-border bg-surface-raised p-1.5 shadow-xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    autoFocus
                    className="flex h-11 items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium text-slate-100 hover:bg-surface-border"
                    onClick={openSaveAsProgram}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400" aria-hidden="true">
                      <path d="M5 4h11l3 3v13H5z" />
                      <path d="M8 4v5h7M8 20v-6h8v6" />
                    </svg>
                    {t('workout.saveAsProgram')}
                  </button>
                  <div className="mx-1.5 my-1 h-px bg-surface-border" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex h-11 items-center gap-2.5 rounded-lg px-3 text-left text-sm font-semibold text-red-400 hover:bg-surface-border"
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleteOpen(true);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                    </svg>
                    {t('workout.deleteWorkout')}
                  </button>
                </div>
              )}
              {saveAsProgramOpen && (
                <div className="absolute right-0 top-12 z-20 w-72 max-w-[calc(100vw-2rem)] animate-pop-in rounded-lg border border-surface-border bg-surface-raised p-3 shadow-xl">
                  <label className="label" htmlFor="newProgramName">
                    {t('workout.saveAsProgramNameLabel')}
                  </label>
                  <input
                    id="newProgramName"
                    className="input mt-1 w-full"
                    placeholder={t('workout.saveAsProgramNamePlaceholder')}
                    maxLength={50}
                    value={newProgramName}
                    onChange={(e) => setNewProgramName(e.target.value)}
                    autoFocus
                  />
                  {saveAsProgramError && <p className="mt-2 text-xs text-red-400">{saveAsProgramError}</p>}
                  <div className="mt-3 flex justify-end gap-2">
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setSaveAsProgramOpen(false)}>
                      {t('common.cancel')}
                    </button>
                    <button
                      className="rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20"
                      onClick={handleSaveAsProgram}
                      disabled={createProgramMutation.isPending}
                    >
                      {createProgramMutation.isPending ? t('common.saving') : t('common.save')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <input
            aria-label={t('workout.nameAria')}
            className="w-full border-0 border-b border-dashed border-slate-600 bg-transparent pb-1.5 pt-1 text-2xl font-bold text-slate-100 placeholder:text-hint focus:border-accent focus:outline-none"
            placeholder={t('workout.namePlaceholder')}
            maxLength={20}
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitLabel}
          />
          {workout.timeEnd && (
            <p className="text-sm text-slate-400">
              {t(workout.autoFinished ? 'workout.autoFinishedDuration' : 'workout.finishedDuration', {
                duration: duration ?? '—',
              })}
            </p>
          )}
          {workout.autoFinished && <p className="text-xs text-slate-400">{t('workout.autoFinishedHint')}</p>}
        </div>

        {/* No Save button: everything saves by itself (user's decision
            2026-10-29) - a status line says so, with "Retry" on a failure. */}
        <p className="flex min-h-5 items-center gap-1.5 text-xs" aria-live="polite">
          {saveMutation.isPending ? (
            <span className="flex items-center gap-1.5 text-slate-400">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {t('workout.saveStatus.saving')}
            </span>
          ) : saveFailed ? (
            <>
              <span className="text-red-400">{t('workout.saveStatus.failed')}</span>
              <span className="text-slate-400" aria-hidden="true">·</span>
              <button type="button" className="min-h-11 px-1 font-semibold text-accent hover:text-accent-hover" onClick={retrySave}>
                {t('workout.saveStatus.retry')}
              </button>
            </>
          ) : savedJson !== null && !dirty && !error ? (
            <span className="text-slate-400">{t('workout.saveStatus.saved')}</span>
          ) : null}
        </p>

        {/* Whether the screen is kept on - so a phone that still dims says why
            (the browser refused, or it cannot hold the screen at all). */}
        {workoutPaused ? (
          <p className="-mt-2 text-xs text-slate-400">{t('workout.wakeLock.paused')}</p>
        ) : wakeLock.kind === 'held' ? (
          <p className="-mt-2 text-xs text-slate-400">{t('workout.wakeLock.held')}</p>
        ) : wakeLock.kind === 'denied' ? (
          <p className="-mt-2 text-xs text-amber-400">{t('workout.wakeLock.denied', { reason: wakeLock.reason })}</p>
        ) : wakeLock.kind === 'unsupported' ? (
          <p className="-mt-2 text-xs text-amber-400">{t('workout.wakeLock.unsupported')}</p>
        ) : wakeLock.kind === 'pending' ? (
          // Also the second after the system dropped the lock - seeing this
          // flash mid-workout means the system keeps releasing it.
          <p className="-mt-2 text-xs text-slate-400">{t('workout.wakeLock.pending')}</p>
        ) : null}

        {!workout.timeEnd && (
          <button className="btn-primary h-12 w-full" onClick={handleFinish} disabled={saving}>
            {t('workout.finish')}
          </button>
        )}

        {hasPrevious && (
          <div className="flex items-center gap-3 whitespace-nowrap text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-hint" aria-hidden="true" />
              {t('workout.legend.last')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-target" aria-hidden="true" />
              {t('workout.legend.target')}
            </span>
            <span className="ml-auto">{t('workout.legend.tap')}</span>
          </div>
        )}
      </section>

      {/* A failed save is in the status line; this is what retrying can't fix. */}
      {error && !saveFailed && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="flex flex-col gap-3">
        {blocks.map((block) => {
          const exercise = exerciseById.get(block.exerciseId);
          if (!exercise) return null;
          return (
            <WorkoutExerciseCard
              key={block.exerciseId}
              block={block}
              exercise={exercise}
              progression={progressionByExerciseId.get(block.exerciseId)}
              saved={savedById.get(block.exerciseId)}
              setsLocked={lockedSetsIds.has(block.exerciseId)}
              onChange={(patch) => updateBlock(block.exerciseId, patch)}
              onCommit={requestSave}
              onAddSet={() => addSet(block.exerciseId)}
              onRemoveSet={(setKey) => removeSet(block.exerciseId, setKey)}
              onRemove={() => removeExercise(block.exerciseId)}
            />
          );
        })}

        {addPickerOpen ? (
          <div className="card flex flex-wrap items-center gap-3">
            <Select
              className="flex-1"
              value={addExerciseId}
              onChange={setAddExerciseId}
              options={availableExercises.map((e) => ({ value: e.id, label: e.name }))}
              placeholder={t('workout.addExercisePlaceholder')}
            />
            <button className="btn-secondary" onClick={addExercise} disabled={!addExerciseId}>
              {t('workout.addExerciseButton')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 text-sm font-semibold text-slate-100 hover:border-accent"
            onClick={() => setAddPickerOpen(true)}
            disabled={availableExercises.length === 0}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t('workout.addExercise')}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title={t('workout.deleteConfirmTitle')}
        description={t('workout.deleteConfirmDescription')}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
