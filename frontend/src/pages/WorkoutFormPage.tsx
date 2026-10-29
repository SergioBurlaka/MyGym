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
  useWorkoutQuery,
} from '../shared/api/workouts/index.js';
import { useCreateProgramMutation, useProgramsQuery } from '../shared/api/programs/index.js';
import { formatDuration } from '../utils/weight.js';
import { translateApiError } from '../utils/apiError.js';
import ConfirmDialog from '../components/ConfirmDialog.js';
import Select from '../components/Select.js';
import WorkoutExerciseCard, { type EditableExercise, type EditableSet } from '../components/WorkoutExerciseCard.js';
import type { WorkoutExercise } from '../types/index.js';

const todayIso = new Date().toISOString().slice(0, 10);

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
// workout, not done.
function buildPayload(source: EditableExercise[]) {
  return {
    exercises: source.map((b) => ({
      exerciseId: b.exerciseId,
      weightPerUnitKg: b.weightPerUnitKg === '' ? null : Number(b.weightPerUnitKg),
      weightUnits: b.weightPerUnitKg === '' ? null : b.weightUnits,
      // The server keeps it for a barbell only.
      barKg: b.weightPerUnitKg === '' ? null : Number(b.barKg),
      sets: b.sets
        .filter((s) => s.reps.trim() !== '')
        .map((s, i) => ({ setNumber: i + 1, reps: Number(s.reps) }))
        .filter((s) => Number.isFinite(s.reps) && s.reps >= 0),
    })),
  };
}

// The saved sets, then empty cells up to the planned count: the program's
// targetSets, else as many as last time, else one.
function editableBlock(we: WorkoutExercise, targetSets: number | undefined): EditableExercise {
  const saved = [...we.sets].sort((a, b) => a.setNumber - b.setNumber).map((s) => newSet(String(s.reps)));
  const planned = targetSets ?? (we.previous?.reps.length || 1);
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

  const [blocks, setBlocks] = useState<EditableExercise[]>([]);
  // null until the form is seeded from the server - nothing may be saved
  // before that (an empty form would replace the workout's exercises).
  const [savedJson, setSavedJson] = useState<string | null>(null);
  const [addExerciseId, setAddExerciseId] = useState('');
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [dateDraft, setDateDraft] = useState('');
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

  // Seed the local edit state once per workout - not on every cache update
  // a save/finish triggers for this same id - and only once programs are in
  // (they size the placeholder rows).
  const seededForRef = useRef<string | null>(null);
  useEffect(() => {
    const workout = workoutQuery.data;
    if (!workout || programsQuery.isPending || seededForRef.current === workout.id) return;
    seededForRef.current = workout.id;
    const initial = workout.workoutExercises.map((we) => editableBlock(we, targetSetsById.get(we.exerciseId)));
    setBlocks(initial);
    setSavedJson(JSON.stringify(buildPayload(initial)));
    setLabelDraft(workout.programLabel ?? '');
    setDateDraft(workout.date);
  }, [workoutQuery.data, programsQuery.isPending, targetSetsById]);

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
    if (!value || value === workoutQuery.data?.date) return;
    updateMutation.mutate({ date: value });
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
    setBlocks((prev) =>
      prev.map((b) => (b.exerciseId === exerciseId ? { ...b, sets: [...b.sets, newSet()] } : b)),
    );
  }

  function removeSet(exerciseId: string, setKey: string) {
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
    const payload = buildPayload(blocksRef.current);
    const json = JSON.stringify(payload);
    if (json === savedJsonRef.current) return;
    try {
      await saveMutation.mutateAsync(payload);
      savedJsonRef.current = json;
      setSavedJson(json);
      setError(null);
    } catch (err) {
      setError(translateApiError(err, t, 'workout.genericSaveError'));
    }
  }

  function handleSave() {
    setError(null);
    void flushSave();
  }

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
            <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-surface-border bg-surface-raised pl-3 pr-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-accent-hover" aria-hidden="true">
                <rect x="4" y="5" width="16" height="15" rx="2" />
                <path d="M4 10h16M9 3v4M15 3v4" />
              </svg>
              <input
                type="date"
                aria-label={t('workout.dateLabel')}
                className="w-36 bg-transparent text-base font-semibold text-slate-100 [color-scheme:dark] focus:outline-none"
                value={dateDraft}
                max={todayIso}
                onChange={(e) => commitDate(e.target.value)}
              />
            </label>
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

        <div className="flex gap-2">
          {!workout.timeEnd && (
            <button className="btn-secondary h-12 flex-1" onClick={handleFinish} disabled={saving}>
              {t('workout.finish')}
            </button>
          )}
          <button
            className="btn-primary h-12 flex-1"
            onClick={handleSave}
            disabled={saving || !dirty}
            aria-busy={saving}
          >
            {saving && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {saving ? t('workout.saving') : t('workout.save')}
          </button>
        </div>

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

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

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
