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
import { useCreateProgramMutation } from '../shared/api/programs/index.js';
import { formatDuration } from '../utils/weight.js';
import { labelColor } from '../utils/labelColor.js';
import { translateApiError } from '../utils/apiError.js';
import { progressionMessage } from '../utils/progressionMessage.js';
import ProgressionBadge from '../components/ProgressionBadge.js';
import TryMoreStatusBadge from '../components/TryMoreStatusBadge.js';
import { journalTryMoreStatus } from '../utils/tryMoreCountdown.js';
import Popconfirm from '../components/Popconfirm.js';
import Select from '../components/Select.js';

const todayIso = new Date().toISOString().slice(0, 10);

// `removing`: the set's remove button was pressed and its "Undo" row is still
// showing. Until the removal is committed the set is saved as if still there,
// so an undo never needs a request and a mis-tap never reaches the server.
// `key`: a client-only id, stable while sets around it come and go - an
// index key would shift rows under the person's finger when a pending
// removal is committed mid-typing, sending reps into the neighbouring set.
type EditableSet = { key: string; reps: string; removing?: boolean };

const UNDO_REMOVE_SET_MS = 5000;

let setKeySeq = 0;
function newSet(reps = ''): EditableSet {
  setKeySeq += 1;
  return { key: `set-${setKeySeq}`, reps };
}

// What gets saved and compared for "dirty": reps only - keys and `removing`
// marks dropped (a set pending removal still counts as present).
function withoutRemovalMarks(blocks: EditableExercise[]): EditableExercise[] {
  return blocks.map((b) => ({ ...b, sets: b.sets.map((s) => ({ reps: s.reps }) as EditableSet) }));
}

function withRemovalsApplied(blocks: EditableExercise[]): EditableExercise[] {
  return blocks.map((b) => ({ ...b, sets: b.sets.filter((s) => !s.removing) }));
}
type EditableExercise = {
  exerciseId: string;
  weightPerUnitKg: string; // '' = bodyweight / no external load
  weightUnits: 1 | 2;
  sets: EditableSet[];
};

export default function WorkoutFormPage() {
  const { t } = useTranslation();
  const CATEGORY_LABEL: Record<string, string> = {
    large: t('exercises.category.large'),
    small: t('exercises.category.small'),
    bodyweight: t('exercises.category.bodyweight'),
  };
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const workoutQuery = useWorkoutQuery(id);
  const exercisesQuery = useExercisesQuery();
  const progressionQuery = useProgressionQuery();

  const saveMutation = useSaveWorkoutExercisesMutation(id ?? '');
  const finishMutation = useFinishWorkoutMutation(id ?? '');
  const deleteMutation = useDeleteWorkoutMutation(id ?? '');
  const updateMutation = useUpdateWorkoutMutation(id ?? '');
  const createProgramMutation = useCreateProgramMutation();

  const exercises = exercisesQuery.data ?? [];
  const progression = progressionQuery.data ?? [];

  const [blocks, setBlocks] = useState<EditableExercise[]>([]);
  const [savedBlocks, setSavedBlocks] = useState<EditableExercise[]>([]);
  const [addExerciseId, setAddExerciseId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [dateDraft, setDateDraft] = useState('');
  const [saveAsProgramOpen, setSaveAsProgramOpen] = useState(false);
  const [newProgramName, setNewProgramName] = useState('');
  const [saveAsProgramError, setSaveAsProgramError] = useState<string | null>(null);
  const saveAsProgramRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!saveAsProgramOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (saveAsProgramRef.current && !saveAsProgramRef.current.contains(e.target as Node)) {
        setSaveAsProgramOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setSaveAsProgramOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [saveAsProgramOpen]);

  useEffect(() => {
    if (!workoutQuery.data) return;
    const initial = workoutQuery.data.workoutExercises.map((we) => ({
      exerciseId: we.exerciseId,
      weightPerUnitKg: we.weightPerUnitKg ?? '',
      weightUnits: (we.weightUnits as 1 | 2) ?? 2,
      sets: we.sets
        .sort((a, b) => a.setNumber - b.setNumber)
        .map((s) => newSet(String(s.reps))),
    }));
    setBlocks(initial);
    setSavedBlocks(withoutRemovalMarks(initial));
    setLabelDraft(workoutQuery.data.programLabel ?? '');
    setDateDraft(workoutQuery.data.date);
    // Only re-seed local edit state when we land on a (new) workout — not on
    // every cache update a save/finish mutation triggers for this same id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutQuery.data?.id]);

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
    () => JSON.stringify(withoutRemovalMarks(blocks)) !== JSON.stringify(savedBlocks),
    [blocks, savedBlocks],
  );

  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const progressionByExerciseId = useMemo(
    () => new Map(progression.map((p) => [p.exerciseId, p])),
    [progression],
  );
  // The try-more counter after this workout, as the journal cards show it -
  // from the saved state, so it moves with every autosave. An exercise not
  // saved yet has none.
  const progressAtByExerciseId = useMemo(
    () => new Map((workoutQuery.data?.workoutExercises ?? []).map((we) => [we.exerciseId, we.progressAt])),
    [workoutQuery.data],
  );
  const usedIds = useMemo(() => new Set(blocks.map((b) => b.exerciseId)), [blocks]);
  const availableExercises = exercises.filter((e) => !usedIds.has(e.id));

  function addExercise() {
    if (!addExerciseId) return;
    setBlocks((prev) => [...prev, { exerciseId: addExerciseId, weightPerUnitKg: '', weightUnits: 2, sets: [newSet()] }]);
    setAddExerciseId('');
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
    requestSave();
  }

  function updateSetReps(exerciseId: string, index: number, reps: string) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.exerciseId === exerciseId
          ? { ...b, sets: b.sets.map((s, i) => (i === index ? { ...s, reps } : s)) }
          : b,
      ),
    );
  }

  // Removing a set only marks it and shows "Undo" in its place; the removal
  // is committed (and saved) once the undo window passes - or right away on
  // Save / Finish / leaving the page. Each new removal restarts the window.
  const removalTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Undo puts focus back on the restored set's remove button (its ref
  // callback picks this up), instead of dropping it to <body>.
  const focusSetKeyRef = useRef<string | null>(null);

  function markSet(exerciseId: string, setKey: string, removing: boolean) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.exerciseId === exerciseId
          ? {
              ...b,
              sets: b.sets.map((s) =>
                s.key === setKey ? { key: s.key, reps: s.reps, ...(removing && { removing }) } : s,
              ),
            }
          : b,
      ),
    );
  }

  function removeSet(exerciseId: string, setKey: string) {
    markSet(exerciseId, setKey, true);
    clearTimeout(removalTimerRef.current);
    removalTimerRef.current = setTimeout(() => {
      setBlocks(withRemovalsApplied);
      requestSave();
    }, UNDO_REMOVE_SET_MS);
  }

  function undoRemoveSet(exerciseId: string, setKey: string) {
    focusSetKeyRef.current = setKey;
    markSet(exerciseId, setKey, false);
  }

  const hasPendingRemoval = blocks.some((b) => b.sets.some((s) => s.removing));

  // For Save / Finish / unmount, which read blocksRef right away instead of
  // waiting for a render.
  function commitRemovalsNow() {
    clearTimeout(removalTimerRef.current);
    blocksRef.current = withRemovalsApplied(blocksRef.current);
    setBlocks(withRemovalsApplied);
  }

  function buildPayload(source: EditableExercise[]) {
    return {
      exercises: source.map((b) => ({
        exerciseId: b.exerciseId,
        weightPerUnitKg: b.weightPerUnitKg === '' ? null : Number(b.weightPerUnitKg),
        weightUnits: b.weightPerUnitKg === '' ? null : b.weightUnits,
        sets: b.sets
          .filter((s) => s.reps.trim() !== '')
          .map((s, i) => ({ setNumber: i + 1, reps: Number(s.reps) }))
          .filter((s) => Number.isFinite(s.reps) && s.reps >= 0),
      })),
    };
  }

  // Autosave: blur on a reps/weight input, or any structural change (add/remove
  // set or exercise, units), requests a save. Saves run strictly one after
  // another - the backend replaces all of a workout's exercises in one
  // delete+insert transaction, so two in flight at once could interleave.
  // A request made while a save is running just marks `pending`; the running
  // loop then saves again with the latest blocks.
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const savedRef = useRef(savedBlocks);
  savedRef.current = savedBlocks;
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
    if (saveTick > 0) void flushSave({ silentIfIncomplete: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveTick]);

  // Leaving the page (navbar link, back) with an unsaved edit still saves it.
  // Only refs are read, so the mount-time closure is fine; the mutation keeps
  // running after unmount.
  useEffect(
    () => () => {
      if (deletedRef.current) {
        clearTimeout(removalTimerRef.current);
        return;
      }
      commitRemovalsNow();
      void flushSave({ silentIfIncomplete: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function flushSave({ silentIfIncomplete }: { silentIfIncomplete: boolean }): Promise<void> {
    pendingSaveRef.current = true;
    if (!saveLoopRef.current) {
      saveLoopRef.current = (async () => {
        while (pendingSaveRef.current) {
          pendingSaveRef.current = false;
          await saveOnce(silentIfIncomplete);
        }
      })().finally(() => {
        saveLoopRef.current = null;
      });
    }
    return saveLoopRef.current;
  }

  async function saveOnce(silentIfIncomplete: boolean) {
    const snapshot = withoutRemovalMarks(blocksRef.current);
    if (JSON.stringify(snapshot) === JSON.stringify(savedRef.current)) return;

    const payload = buildPayload(snapshot);
    // An exercise just added has no reps yet - autosave waits until it does
    // instead of nagging mid-entry; only the explicit Save button complains.
    if (payload.exercises.some((e) => e.sets.length === 0)) {
      if (!silentIfIncomplete) setError(t('workout.emptySetError'));
      return;
    }

    try {
      await saveMutation.mutateAsync(payload);
      savedRef.current = snapshot;
      setSavedBlocks(snapshot);
      setError(null);
    } catch (err) {
      setError(translateApiError(err, t, 'workout.genericSaveError'));
    }
  }

  function handleSave() {
    setError(null);
    commitRemovalsNow();
    void flushSave({ silentIfIncomplete: false });
  }

  async function handleFinish() {
    commitRemovalsNow();
    await flushSave({ silentIfIncomplete: false });
    await finishMutation.mutateAsync();
  }

  async function handleDelete() {
    await deleteMutation.mutateAsync();
    // Nothing left to save into - skip the leave-the-page save on unmount.
    deletedRef.current = true;
    navigate('/');
  }

  function openSaveAsProgram() {
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
    // targetSets = how many set rows this exercise currently has in the
    // form - a new workout started from this program will prefill that
    // many sets (with reps/weight pulled from history at that time, not
    // copied from here).
    const programExercises = withRemovalsApplied(blocks)
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

  if (workoutQuery.isPending || exercisesQuery.isPending || progressionQuery.isPending || !workoutQuery.data) {
    return <p className="text-slate-400">{t('common.loading')}</p>;
  }

  const workout = workoutQuery.data;
  const saving = saveMutation.isPending || finishMutation.isPending;
  const duration = formatDuration(workout.timeStart, workout.timeEnd, workout.autoFinished);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label={t('workout.dateLabel')}
              className="input w-40 text-lg text-slate-100"
              value={dateDraft}
              max={todayIso}
              onChange={(e) => commitDate(e.target.value)}
            />
            {workout.program && (
              <span
                className={`badge ${labelColor(workout.program.name).badgeBg} ${labelColor(workout.program.name).badgeText}`}
              >
                {workout.program.name}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400">
            {workout.timeEnd
              ? t(workout.autoFinished ? 'workout.autoFinishedDuration' : 'workout.finishedDuration', {
                  duration: duration ?? '—',
                })
              : t('workout.inProgress')}
          </p>
          {workout.autoFinished && <p className="text-xs text-slate-500">{t('workout.autoFinishedHint')}</p>}
          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs uppercase tracking-wider text-slate-400" htmlFor="programLabel">
              {t('workout.nameLabel')}
            </label>
            <input
              id="programLabel"
              className="input w-48 py-1 text-sm"
              placeholder={t('workout.namePlaceholder')}
              maxLength={20}
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={commitLabel}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative inline-block" ref={saveAsProgramRef}>
            <button className="btn-secondary" onClick={openSaveAsProgram}>
              {t('workout.saveAsProgram')}
            </button>
            {saveAsProgramOpen && (
              <div className="absolute left-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] sm:left-auto sm:right-0 rounded-lg border border-surface-border bg-surface-raised p-3 shadow-xl">
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
          <Popconfirm
            title={t('workout.deleteConfirmTitle')}
            description={t('workout.deleteConfirmDescription')}
            onConfirm={handleDelete}
          >
            <button className="btn-secondary">{t('common.delete')}</button>
          </Popconfirm>
          {!workout.timeEnd && (
            <button className="btn-secondary" onClick={handleFinish} disabled={saving}>
              {t('workout.finish')}
            </button>
          )}
          <button
            className="btn-primary inline-flex items-center gap-2"
            onClick={handleSave}
            disabled={saving || (!dirty && !hasPendingRemoval)}
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
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="space-y-4">
        {blocks.map((block) => {
          const exercise = exerciseById.get(block.exerciseId);
          if (!exercise) return null;
          const prog = progressionByExerciseId.get(block.exerciseId);
          const isBodyweight = exercise.category === 'bodyweight';
          const tryMore = journalTryMoreStatus(progressAtByExerciseId.get(block.exerciseId));

          return (
            <div key={block.exerciseId} className="card">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl text-slate-100">{exercise.name}</h3>
                  <span className="badge bg-surface-border text-slate-400">
                    {CATEGORY_LABEL[exercise.category]} · {exercise.repRangeMin}-{exercise.repRangeMax} {t('common.reps')}
                  </span>
                  {prog && <ProgressionBadge suggestion={prog.suggestion} title={progressionMessage(prog, t)} />}
                </div>
                <Popconfirm
                  title={t('workout.removeExerciseConfirmTitle')}
                  description={t('workout.removeExerciseConfirmDescription', { name: exercise.name })}
                  confirmText={t('workout.removeExerciseConfirmText')}
                  onConfirm={() => removeExercise(block.exerciseId)}
                >
                  <button className="btn-ghost text-red-400">{t('workout.removeExercise')}</button>
                </Popconfirm>
              </div>

              {tryMore.kind !== 'unknown' && (
                <div className="-mt-1 mb-3">
                  <TryMoreStatusBadge status={tryMore} label="fraction" />
                </div>
              )}

              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="label" htmlFor={`weight-${block.exerciseId}`}>
                    {isBodyweight ? t('workout.extraWeightLabel') : t('workout.weightPerUnitLabel')}
                  </label>
                  <input
                    id={`weight-${block.exerciseId}`}
                    type="text"
                    inputMode="decimal"
                    className="input w-32"
                    placeholder={isBodyweight ? t('workout.weightPlaceholderNoWeight') : '0'}
                    value={block.weightPerUnitKg}
                    onChange={(e) => updateBlock(block.exerciseId, { weightPerUnitKg: e.target.value })}
                    onBlur={requestSave}
                  />
                </div>
                {block.weightPerUnitKg !== '' && (
                  <div>
                    <label className="label">{t('workout.unitsLabel')}</label>
                    <Select
                      className="w-56"
                      value={String(block.weightUnits)}
                      onChange={(v) => {
                        updateBlock(block.exerciseId, { weightUnits: Number(v) as 1 | 2 });
                        requestSave();
                      }}
                      options={[
                        { value: '2', label: t('workout.unitsBothSides') },
                        { value: '1', label: t('workout.unitsOne') },
                      ]}
                    />
                  </div>
                )}
              </div>

              <label className="label">{t('workout.setsLabel')}</label>
              <div className="flex flex-wrap gap-2">
                {block.sets.map((s, i) =>
                  s.removing ? (
                    // Own key, so this row mounts fresh and autoFocus moves focus
                    // from the vanished remove button onto "Undo".
                    <div key={`${s.key}-removed`} className="flex min-h-11 items-center gap-2 text-sm text-slate-400">
                      {t('workout.setRemoved', { set: i + 1 })}
                      <button
                        type="button"
                        autoFocus
                        className="min-h-11 rounded-lg px-2 font-semibold text-accent hover:bg-surface-border"
                        aria-label={t('workout.undoRemoveSetAria', { set: i + 1 })}
                        onClick={() => undoRemoveSet(block.exerciseId, s.key)}
                      >
                        {t('workout.undoRemoveSet')}
                      </button>
                    </div>
                  ) : (
                    <div key={s.key} className="flex items-center gap-1">
                      <span className="w-5 text-center text-xs text-slate-500">{i + 1}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="input w-16 text-center"
                        aria-label={t('workout.repsAria', { exercise: exercise.name, set: i + 1 })}
                        value={s.reps}
                        onChange={(e) => updateSetReps(block.exerciseId, i, e.target.value)}
                        onBlur={requestSave}
                      />
                      {/* 44x44 target 8px from the field: a mis-tap in the gym
                          shouldn't hit it, and "−" doesn't read as "12 ×". */}
                      <button
                        type="button"
                        className="ml-1 flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-surface-border hover:text-red-400"
                        aria-label={t('workout.removeSetAria', { set: i + 1 })}
                        title={t('workout.removeSetAria', { set: i + 1 })}
                        ref={(el) => {
                          if (el && focusSetKeyRef.current === s.key) {
                            focusSetKeyRef.current = null;
                            el.focus();
                          }
                        }}
                        onClick={() => removeSet(block.exerciseId, s.key)}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                          <path d="M6 12h12" />
                        </svg>
                      </button>
                    </div>
                  ),
                )}
                <button className="btn-ghost text-accent" onClick={() => addSet(block.exerciseId)}>
                  {t('workout.addSet')}
                </button>
              </div>
            </div>
          );
        })}
      </div>

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
    </div>
  );
}
