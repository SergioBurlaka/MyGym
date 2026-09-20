import { useEffect, useMemo, useState } from 'react';
import { useExercisesQuery } from '../shared/api/exercises/index.js';
import {
  useCreateProgramMutation,
  useDeleteProgramMutation,
  useProgramsQuery,
  useUpdateProgramMutation,
} from '../shared/api/programs/index.js';
import type { Program } from '../types/index.js';
import Popconfirm from '../components/Popconfirm.js';
import Select from '../components/Select.js';

type EditableExercise = {
  exerciseId: string;
  targetSets: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  large: 'Велика група',
  small: 'Мала група',
  bodyweight: 'Без ваги',
};

export default function ProgramsPage() {
  const programsQuery = useProgramsQuery();
  const exercisesQuery = useExercisesQuery();

  const programs = programsQuery.data ?? [];
  const exercises = exercisesQuery.data ?? [];
  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const [editingId, setEditingId] = useState<string | 'new' | null>(null);

  if (programsQuery.isPending || exercisesQuery.isPending) {
    return <p className="text-slate-400">Завантаження…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl text-slate-100">Програми</h1>
        <button
          className="btn-primary"
          onClick={() => setEditingId(editingId === 'new' ? null : 'new')}
        >
          {editingId === 'new' ? 'Скасувати' : '+ Нова програма'}
        </button>
      </div>

      {editingId === 'new' && (
        <ProgramForm
          exercises={exercises}
          onDone={() => setEditingId(null)}
        />
      )}

      {programs.length === 0 && editingId !== 'new' && (
        <p className="text-slate-400">
          Ще немає жодної програми. Створи програму — і зможеш стартувати з неї тренування
          одним кліком, навіть без попередньої історії.
        </p>
      )}

      <div className="space-y-4">
        {programs.map((program) =>
          editingId === program.id ? (
            <ProgramForm
              key={program.id}
              program={program}
              exercises={exercises}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <ProgramCard
              key={program.id}
              program={program}
              exerciseById={exerciseById}
              onEdit={() => setEditingId(program.id)}
            />
          ),
        )}
      </div>
    </div>
  );
}

function ProgramCard({
  program,
  exerciseById,
  onEdit,
}: {
  program: Program;
  exerciseById: Map<string, { name: string }>;
  onEdit: () => void;
}) {
  const deleteMutation = useDeleteProgramMutation(program.id);

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xl text-slate-100">{program.name}</h3>
          <p className="mt-1 text-sm text-slate-400">
            {program.programExercises
              .map((pe) => `${exerciseById.get(pe.exerciseId)?.name ?? pe.exercise.name} (${pe.targetSets})`)
              .join(', ')}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button className="btn-ghost" onClick={onEdit}>
            Редагувати
          </button>
          <Popconfirm
            title="Видалити програму"
            description={`«${program.name}» буде видалено. Тренування, вже створені з неї, не постраждають.`}
            onConfirm={() => deleteMutation.mutate()}
          >
            <button className="btn-ghost text-red-400">Видалити</button>
          </Popconfirm>
        </div>
      </div>
    </div>
  );
}

function ProgramForm({
  program,
  exercises,
  onDone,
}: {
  program?: Program;
  exercises: { id: string; name: string; category: string; repRangeMin: number; repRangeMax: number }[];
  onDone: () => void;
}) {
  const createMutation = useCreateProgramMutation();
  const updateMutation = useUpdateProgramMutation(program?.id ?? '');

  const [name, setName] = useState(program?.name ?? '');
  const [blocks, setBlocks] = useState<EditableExercise[]>(
    program
      ? program.programExercises.map((pe) => ({
          exerciseId: pe.exerciseId,
          targetSets: String(pe.targetSets),
        }))
      : [],
  );
  const [addExerciseId, setAddExerciseId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(program?.name ?? '');
    setBlocks(
      program
        ? program.programExercises.map((pe) => ({
            exerciseId: pe.exerciseId,
            targetSets: String(pe.targetSets),
          }))
        : [],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.id]);

  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const usedIds = useMemo(() => new Set(blocks.map((b) => b.exerciseId)), [blocks]);
  const availableExercises = exercises.filter((e) => !usedIds.has(e.id));

  function addExercise() {
    if (!addExerciseId) return;
    setBlocks((prev) => [...prev, { exerciseId: addExerciseId, targetSets: '3' }]);
    setAddExerciseId('');
  }

  function removeExercise(exerciseId: string) {
    setBlocks((prev) => prev.filter((b) => b.exerciseId !== exerciseId));
  }

  function updateBlock(exerciseId: string, patch: Partial<EditableExercise>) {
    setBlocks((prev) => prev.map((b) => (b.exerciseId === exerciseId ? { ...b, ...patch } : b)));
  }

  function moveBlock(exerciseId: string, direction: -1 | 1) {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.exerciseId === exerciseId);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Вкажи назву програми.');
      return;
    }
    if (blocks.length === 0) {
      setError('Додай хоча б одну вправу.');
      return;
    }
    if (blocks.some((b) => !b.targetSets || Number(b.targetSets) < 1)) {
      setError('Вкажи цільову кількість підходів (мінімум 1) для кожної вправи.');
      return;
    }

    const body = {
      name: trimmedName,
      exercises: blocks.map((b) => ({
        exerciseId: b.exerciseId,
        targetSets: Number(b.targetSets),
      })),
    };

    try {
      if (program) {
        await updateMutation.mutateAsync(body);
      } else {
        await createMutation.mutateAsync(body);
      }
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Не вдалося зберегти програму');
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="card space-y-4 border-accent/40">
      <div>
        <label className="label">Назва програми</label>
        <input
          className="input"
          placeholder="Наприклад, «Програма А»"
          maxLength={50}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {blocks.map((block, index) => {
          const exercise = exerciseById.get(block.exerciseId);
          if (!exercise) return null;

          return (
            <div key={block.exerciseId} className="rounded-lg border border-surface-border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      className="text-slate-500 hover:text-slate-200 disabled:opacity-30"
                      title="Підняти вище"
                      disabled={index === 0}
                      onClick={() => moveBlock(block.exerciseId, -1)}
                    >
                      ▲
                    </button>
                    <button
                      className="text-slate-500 hover:text-slate-200 disabled:opacity-30"
                      title="Опустити нижче"
                      disabled={index === blocks.length - 1}
                      onClick={() => moveBlock(block.exerciseId, 1)}
                    >
                      ▼
                    </button>
                  </div>
                  <h4 className="text-slate-100">{exercise.name}</h4>
                  <span className="badge bg-surface-border text-slate-400">
                    {CATEGORY_LABEL[exercise.category]} · {exercise.repRangeMin}-{exercise.repRangeMax} повт.
                  </span>
                </div>
                <button className="btn-ghost text-red-400" onClick={() => removeExercise(block.exerciseId)}>
                  Прибрати
                </button>
              </div>
              <div>
                <label className="label">Цільова кількість підходів</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="20"
                  className="input w-32"
                  value={block.targetSets}
                  onChange={(e) => updateBlock(block.exerciseId, { targetSets: e.target.value })}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          className="flex-1"
          value={addExerciseId}
          onChange={setAddExerciseId}
          options={availableExercises.map((e) => ({ value: e.id, label: e.name }))}
          placeholder="Оберіть вправу…"
        />
        <button className="btn-secondary" onClick={addExercise} disabled={!addExerciseId}>
          + Додати вправу
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Зберігаємо…' : 'Зберегти програму'}
        </button>
        <button className="btn-ghost" onClick={onDone}>
          Скасувати
        </button>
      </div>
    </div>
  );
}
