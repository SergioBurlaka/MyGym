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
import Popconfirm from '../components/Popconfirm.js';
import Select from '../components/Select.js';

const todayIso = new Date().toISOString().slice(0, 10);

type EditableSet = { reps: string };
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
        .map((s) => ({ reps: String(s.reps) })),
    }));
    setBlocks(initial);
    setSavedBlocks(initial);
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

  const dirty = useMemo(() => JSON.stringify(blocks) !== JSON.stringify(savedBlocks), [blocks, savedBlocks]);

  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const progressionByExerciseId = useMemo(
    () => new Map(progression.map((p) => [p.exerciseId, p])),
    [progression],
  );
  const usedIds = useMemo(() => new Set(blocks.map((b) => b.exerciseId)), [blocks]);
  const availableExercises = exercises.filter((e) => !usedIds.has(e.id));

  function addExercise() {
    if (!addExerciseId) return;
    setBlocks((prev) => [...prev, { exerciseId: addExerciseId, weightPerUnitKg: '', weightUnits: 2, sets: [{ reps: '' }] }]);
    setAddExerciseId('');
  }

  function removeExercise(exerciseId: string) {
    setBlocks((prev) => prev.filter((b) => b.exerciseId !== exerciseId));
  }

  function updateBlock(exerciseId: string, patch: Partial<EditableExercise>) {
    setBlocks((prev) => prev.map((b) => (b.exerciseId === exerciseId ? { ...b, ...patch } : b)));
  }

  function addSet(exerciseId: string) {
    setBlocks((prev) =>
      prev.map((b) => (b.exerciseId === exerciseId ? { ...b, sets: [...b.sets, { reps: '' }] } : b)),
    );
  }

  function updateSetReps(exerciseId: string, index: number, reps: string) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.exerciseId === exerciseId
          ? { ...b, sets: b.sets.map((s, i) => (i === index ? { reps } : s)) }
          : b,
      ),
    );
  }

  function removeSet(exerciseId: string, index: number) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.exerciseId === exerciseId ? { ...b, sets: b.sets.filter((_, i) => i !== index) } : b,
      ),
    );
  }

  function buildPayload() {
    return {
      exercises: blocks.map((b) => ({
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

  async function handleSave() {
    setError(null);
    const payload = buildPayload();

    const emptyBlock = payload.exercises.find((e) => e.sets.length === 0);
    if (emptyBlock) {
      setError(t('workout.emptySetError'));
      return;
    }

    try {
      await saveMutation.mutateAsync(payload);
      setSavedBlocks(blocks);
    } catch (err) {
      setError(translateApiError(err, t, 'workout.genericSaveError'));
    }
  }

  async function handleFinish() {
    await handleSave();
    await finishMutation.mutateAsync();
  }

  async function handleDelete() {
    await deleteMutation.mutateAsync();
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

  if (workoutQuery.isPending || exercisesQuery.isPending || progressionQuery.isPending || !workoutQuery.data) {
    return <p className="text-slate-400">{t('common.loading')}</p>;
  }

  const workout = workoutQuery.data;
  const saving = saveMutation.isPending || finishMutation.isPending;
  const duration = formatDuration(workout.timeStart, workout.timeEnd);

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
            {workout.timeEnd ? t('workout.finishedDuration', { duration: duration ?? '—' }) : t('workout.inProgress')}
          </p>
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
        <div className="flex gap-2">
          <div className="relative inline-block" ref={saveAsProgramRef}>
            <button className="btn-secondary" onClick={openSaveAsProgram}>
              {t('workout.saveAsProgram')}
            </button>
            {saveAsProgramOpen && (
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-surface-border bg-surface-raised p-3 shadow-xl">
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
          <button className="btn-primary" onClick={handleSave} disabled={saving || !dirty}>
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

          return (
            <div key={block.exerciseId} className="card">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
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

              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="label">
                    {isBodyweight ? t('workout.extraWeightLabel') : t('workout.weightPerUnitLabel')}
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    className="input w-32"
                    placeholder={isBodyweight ? t('workout.weightPlaceholderNoWeight') : '0'}
                    value={block.weightPerUnitKg}
                    onChange={(e) => updateBlock(block.exerciseId, { weightPerUnitKg: e.target.value })}
                  />
                </div>
                {block.weightPerUnitKg !== '' && (
                  <div>
                    <label className="label">{t('workout.unitsLabel')}</label>
                    <Select
                      className="w-56"
                      value={String(block.weightUnits)}
                      onChange={(v) => updateBlock(block.exerciseId, { weightUnits: Number(v) as 1 | 2 })}
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
                {block.sets.map((s, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="w-5 text-center text-xs text-slate-500">{i + 1}</span>
                    <input
                      type="number"
                      min="0"
                      className="input w-16 text-center"
                      value={s.reps}
                      onChange={(e) => updateSetReps(block.exerciseId, i, e.target.value)}
                    />
                    <button
                      className="text-slate-500 hover:text-red-400"
                      title={t('workout.removeSetTitle')}
                      onClick={() => removeSet(block.exerciseId, i)}
                    >
                      ×
                    </button>
                  </div>
                ))}
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
