import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { translateApiError } from '../utils/apiError.js';

type EditableExercise = {
  exerciseId: string;
  targetSets: string;
};

export default function ProgramsPage() {
  const { t } = useTranslation();
  const programsQuery = useProgramsQuery();
  const exercisesQuery = useExercisesQuery();

  const programs = programsQuery.data ?? [];
  const exercises = exercisesQuery.data ?? [];
  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const [editingId, setEditingId] = useState<string | 'new' | null>(null);

  if (programsQuery.isPending || exercisesQuery.isPending) {
    return <p className="text-slate-400">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl text-slate-100">{t('programs.title')}</h1>
        <button
          className="btn-primary"
          onClick={() => setEditingId(editingId === 'new' ? null : 'new')}
        >
          {editingId === 'new' ? t('programs.cancel') : t('programs.newProgram')}
        </button>
      </div>

      {editingId === 'new' && (
        <ProgramForm
          exercises={exercises}
          onDone={() => setEditingId(null)}
        />
      )}

      {programs.length === 0 && editingId !== 'new' && (
        <p className="text-slate-400">{t('programs.emptyState')}</p>
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
  const { t } = useTranslation();
  const deleteMutation = useDeleteProgramMutation(program.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen]);

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xl font-semibold text-slate-100">{program.name}</h3>
          <p className="mt-0.5 text-sm text-slate-400">
            {t('programs.exerciseCount', { count: program.programExercises.length })}
          </p>
        </div>
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            aria-label={t('programs.cardMenuLabel', { name: program.name })}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-surface-border hover:text-white"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-44 animate-pop-in rounded-lg border border-surface-border bg-surface-raised p-1.5 shadow-xl">
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-200 hover:bg-surface-border"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 20h4L19 9l-4-4L4 16z" />
                </svg>
                {t('common.edit')}
              </button>
              <Popconfirm
                title={t('programs.deleteConfirmTitle')}
                description={t('programs.deleteConfirmDescription', { name: program.name })}
                onConfirm={() => {
                  setMenuOpen(false);
                  deleteMutation.mutate();
                }}
              >
                <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-red-400 hover:bg-surface-border">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                  </svg>
                  {t('common.delete')}
                </button>
              </Popconfirm>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {program.programExercises.map((pe) => (
          <span key={pe.id} className="rounded-lg bg-surface-border px-2.5 py-1.5 text-sm text-slate-200">
            {exerciseById.get(pe.exerciseId)?.name ?? pe.exercise.name}{' '}
            <span className="text-slate-400">×{pe.targetSets}</span>
          </span>
        ))}
      </div>

      {program.tryMoreAfterWorkouts != null && (
        <div className="flex items-center gap-2 border-t border-surface-border pt-2.5 text-xs text-slate-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f5a524" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M15 7h6v6" />
          </svg>
          <span>{t('programs.tryMoreAfterWorkoutsBadge', { count: program.tryMoreAfterWorkouts })}</span>
        </div>
      )}
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
  const { t } = useTranslation();
  const CATEGORY_LABEL: Record<string, string> = {
    large: t('exercises.category.large'),
    small: t('exercises.category.small'),
    bodyweight: t('exercises.category.bodyweight'),
  };
  const createMutation = useCreateProgramMutation();
  const updateMutation = useUpdateProgramMutation(program?.id ?? '');

  const [name, setName] = useState(program?.name ?? '');
  const [tryMoreAfterWorkouts, setTryMoreAfterWorkouts] = useState(
    program?.tryMoreAfterWorkouts != null ? String(program.tryMoreAfterWorkouts) : '',
  );
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
    setTryMoreAfterWorkouts(program?.tryMoreAfterWorkouts != null ? String(program.tryMoreAfterWorkouts) : '');
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
      setError(t('programs.form.errorNameRequired'));
      return;
    }
    if (blocks.length === 0) {
      setError(t('programs.form.errorExerciseRequired'));
      return;
    }
    if (blocks.some((b) => !b.targetSets || Number(b.targetSets) < 1)) {
      setError(t('programs.form.errorTargetSets'));
      return;
    }
    const trimmedTryMore = tryMoreAfterWorkouts.trim();
    if (trimmedTryMore !== '' && Number(trimmedTryMore) < 1) {
      setError(t('programs.form.errorTryMoreAfterWorkouts'));
      return;
    }

    const body = {
      name: trimmedName,
      exercises: blocks.map((b) => ({
        exerciseId: b.exerciseId,
        targetSets: Number(b.targetSets),
      })),
      tryMoreAfterWorkouts: trimmedTryMore === '' ? null : Number(trimmedTryMore),
    };

    try {
      if (program) {
        await updateMutation.mutateAsync(body);
      } else {
        await createMutation.mutateAsync(body);
      }
      onDone();
    } catch (err) {
      setError(translateApiError(err, t, 'programs.form.errorGeneric'));
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="card space-y-4 border-accent/40">
      <div>
        <label className="label">{t('programs.form.nameLabel')}</label>
        <input
          className="input"
          placeholder={t('programs.form.namePlaceholder')}
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
                      title={t('programs.form.moveUp')}
                      disabled={index === 0}
                      onClick={() => moveBlock(block.exerciseId, -1)}
                    >
                      ▲
                    </button>
                    <button
                      className="text-slate-500 hover:text-slate-200 disabled:opacity-30"
                      title={t('programs.form.moveDown')}
                      disabled={index === blocks.length - 1}
                      onClick={() => moveBlock(block.exerciseId, 1)}
                    >
                      ▼
                    </button>
                  </div>
                  <h4 className="text-slate-100">{exercise.name}</h4>
                  <span className="badge bg-surface-border text-slate-400">
                    {CATEGORY_LABEL[exercise.category]} · {exercise.repRangeMin}-{exercise.repRangeMax} {t('common.reps')}
                  </span>
                </div>
                <button className="btn-ghost text-red-400" onClick={() => removeExercise(block.exerciseId)}>
                  {t('programs.form.remove')}
                </button>
              </div>
              <div>
                <label className="label">{t('programs.form.targetSetsLabel')}</label>
                <input
                  type="text"
                  inputMode="numeric"
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
          placeholder={t('programs.form.addExercisePlaceholder')}
        />
        <button className="btn-secondary" onClick={addExercise} disabled={!addExerciseId}>
          {t('programs.form.addExerciseButton')}
        </button>
      </div>

      <div>
        <label className="label">{t('programs.form.tryMoreAfterWorkoutsLabel')}</label>
        <input
          type="text"
          inputMode="numeric"
          className="input w-32"
          placeholder={t('programs.form.tryMoreAfterWorkoutsPlaceholder')}
          value={tryMoreAfterWorkouts}
          onChange={(e) => setTryMoreAfterWorkouts(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">{t('programs.form.tryMoreAfterWorkoutsHint')}</p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? t('programs.form.saving') : t('programs.form.saveButton')}
        </button>
        <button className="btn-ghost" onClick={onDone}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
