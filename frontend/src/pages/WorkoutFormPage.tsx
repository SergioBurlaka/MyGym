import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useExercisesQuery } from '../shared/api/exercises/index.js';
import { useProgressionQuery } from '../shared/api/progression/index.js';
import {
  useDeleteWorkoutMutation,
  useFinishWorkoutMutation,
  useSaveWorkoutExercisesMutation,
  useUpdateWorkoutLabelMutation,
  useWorkoutQuery,
} from '../shared/api/workouts/index.js';
import { formatDateUk, formatDuration } from '../utils/weight.js';
import ProgressionBadge from '../components/ProgressionBadge.js';
import Popconfirm from '../components/Popconfirm.js';

type EditableSet = { reps: string };
type EditableExercise = {
  exerciseId: string;
  weightPerUnitKg: string; // '' = bodyweight / no external load
  weightUnits: 1 | 2;
  sets: EditableSet[];
};

const CATEGORY_LABEL: Record<string, string> = {
  large: 'Велика група',
  small: 'Мала група',
  bodyweight: 'Без ваги',
};

export default function WorkoutFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const workoutQuery = useWorkoutQuery(id);
  const exercisesQuery = useExercisesQuery();
  const progressionQuery = useProgressionQuery();

  const saveMutation = useSaveWorkoutExercisesMutation(id ?? '');
  const finishMutation = useFinishWorkoutMutation(id ?? '');
  const deleteMutation = useDeleteWorkoutMutation(id ?? '');
  const updateLabelMutation = useUpdateWorkoutLabelMutation(id ?? '');

  const exercises = exercisesQuery.data ?? [];
  const progression = progressionQuery.data ?? [];

  const [blocks, setBlocks] = useState<EditableExercise[]>([]);
  const [addExerciseId, setAddExerciseId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');

  useEffect(() => {
    if (!workoutQuery.data) return;
    setBlocks(
      workoutQuery.data.workoutExercises.map((we) => ({
        exerciseId: we.exerciseId,
        weightPerUnitKg: we.weightPerUnitKg ?? '',
        weightUnits: (we.weightUnits as 1 | 2) ?? 2,
        sets: we.sets
          .sort((a, b) => a.setNumber - b.setNumber)
          .map((s) => ({ reps: String(s.reps) })),
      })),
    );
    setLabelDraft(workoutQuery.data.programLabel ?? '');
    // Only re-seed local edit state when we land on a (new) workout — not on
    // every cache update a save/finish mutation triggers for this same id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutQuery.data?.id]);

  function commitLabel() {
    const trimmed = labelDraft.trim();
    if (trimmed === (workoutQuery.data?.programLabel ?? '')) return;
    updateLabelMutation.mutate(trimmed === '' ? null : trimmed);
  }

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
      setError('У кожній доданій вправі має бути хоча б один підхід із заповненими повтореннями.');
      return;
    }

    try {
      await saveMutation.mutateAsync(payload);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Не вдалося зберегти');
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

  if (workoutQuery.isPending || exercisesQuery.isPending || progressionQuery.isPending || !workoutQuery.data) {
    return <p className="text-slate-400">Завантаження…</p>;
  }

  const workout = workoutQuery.data;
  const saving = saveMutation.isPending || finishMutation.isPending;
  const duration = formatDuration(workout.timeStart, workout.timeEnd);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl text-slate-100">{formatDateUk(workout.date)}</h1>
          <p className="text-sm text-slate-400">
            {workout.timeEnd ? `Завершено · тривалість ${duration ?? '—'}` : 'Тренування триває…'}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs uppercase tracking-wider text-slate-400" htmlFor="programLabel">
              Мітка
            </label>
            <input
              id="programLabel"
              className="input w-24 py-1 text-sm"
              placeholder="А / Б…"
              maxLength={20}
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={commitLabel}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Popconfirm
            title="Видалити тренування"
            description="Це незворотньо — усі вправи й підходи цього тренування буде втрачено назавжди."
            onConfirm={handleDelete}
          >
            <button className="btn-secondary">Видалити</button>
          </Popconfirm>
          {!workout.timeEnd && (
            <button className="btn-secondary" onClick={handleFinish} disabled={saving}>
              Завершити тренування
            </button>
          )}
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Зберігаємо…' : 'Зберегти'}
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
                    {CATEGORY_LABEL[exercise.category]} · {exercise.repRangeMin}-{exercise.repRangeMax} повт.
                  </span>
                  {prog && <ProgressionBadge suggestion={prog.suggestion} title={prog.message} />}
                </div>
                <Popconfirm
                  title="Прибрати вправу з тренування"
                  description={`«${exercise.name}» разом з усіма введеними підходами буде прибрано з цього тренування.`}
                  confirmText="Так, прибрати"
                  onConfirm={() => removeExercise(block.exerciseId)}
                >
                  <button className="btn-ghost text-red-400">Прибрати</button>
                </Popconfirm>
              </div>

              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="label">
                    {isBodyweight ? 'Додаткова вага (опційно)' : 'Вага за одиницю, кг'}
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    className="input w-32"
                    placeholder={isBodyweight ? 'без ваги' : '0'}
                    value={block.weightPerUnitKg}
                    onChange={(e) => updateBlock(block.exerciseId, { weightPerUnitKg: e.target.value })}
                  />
                </div>
                {block.weightPerUnitKg !== '' && (
                  <div>
                    <label className="label">Одиниць</label>
                    <select
                      className="input w-28"
                      value={block.weightUnits}
                      onChange={(e) =>
                        updateBlock(block.exerciseId, { weightUnits: Number(e.target.value) as 1 | 2 })
                      }
                    >
                      <option value={2}>2 (обидві сторони)</option>
                      <option value={1}>1</option>
                    </select>
                  </div>
                )}
              </div>

              <label className="label">Підходи (повторення)</label>
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
                      title="Прибрати підхід"
                      onClick={() => removeSet(block.exerciseId, i)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button className="btn-ghost text-accent" onClick={() => addSet(block.exerciseId)}>
                  + підхід
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card flex flex-wrap items-center gap-3">
        <select className="input flex-1" value={addExerciseId} onChange={(e) => setAddExerciseId(e.target.value)}>
          <option value="">Оберіть вправу…</option>
          {availableExercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <button className="btn-secondary" onClick={addExercise} disabled={!addExerciseId}>
          + Додати вправу
        </button>
      </div>
    </div>
  );
}
