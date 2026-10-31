import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useExercisesQuery } from '../shared/api/exercises/index.js';
import {
  useCreateProgramMutation,
  useDeleteProgramMutation,
  useProgramsQuery,
  useUpdateProgramMutation,
} from '../shared/api/programs/index.js';
import { useProgressionQuery } from '../shared/api/progression/index.js';
import type { ExerciseProgression, MuscleCategory, Program } from '../types/index.js';
import Popconfirm from '../components/Popconfirm.js';
import { translateApiError } from '../utils/apiError.js';
import { DEFAULT_TRY_MORE_AFTER_WORKOUTS, tryMoreStatus } from '../utils/tryMoreCountdown.js';
import TryMoreStatusBadge from '../components/TryMoreStatusBadge.js';
import LockIcon from '../components/LockIcon.js';

// Backend limits (programs.schema.ts).
const SETS_MAX = 20;
const TRY_MORE_MAX = 60;
// Above this many workouts the segments get too thin to tap - a slider
// instead (the same cut-off as TryMoreStatusBadge's segments).
const MAX_SEGMENTS = 12;

type ExerciseOption = { id: string; name: string; category: string; repRangeMin: number; repRangeMax: number };

type EditableExercise = {
  exerciseId: string;
  targetSets: number;
  // Own "try more" threshold; null = the category default. A value equal to
  // the default is stored as null too, so a later change of the default
  // still applies.
  tryMoreAfterWorkouts: number | null;
  // A workout from this program can't add or remove sets of this exercise.
  lockSets: boolean;
  // "Already without progress" position; null = untouched, not sent, so
  // saving the program leaves the counter as it is.
  sessionsDone: number | null;
};

type ProgressionById = Map<string, ExerciseProgression>;

function defaultThresholdOf(category: string | undefined): number {
  return DEFAULT_TRY_MORE_AFTER_WORKOUTS[category as MuscleCategory] ?? DEFAULT_TRY_MORE_AFTER_WORKOUTS.large;
}

function toEditable(program?: Program): EditableExercise[] {
  return (program?.programExercises ?? []).map((pe) => ({
    exerciseId: pe.exerciseId,
    targetSets: pe.targetSets,
    tryMoreAfterWorkouts: pe.tryMoreAfterWorkouts,
    lockSets: pe.lockSets,
    sessionsDone: null,
  }));
}

export default function ProgramsPage() {
  const { t } = useTranslation();
  const programsQuery = useProgramsQuery();
  const exercisesQuery = useExercisesQuery();
  // Optional - the countdowns just don't show while it loads or if it fails.
  const progressionQuery = useProgressionQuery();

  const programs = programsQuery.data ?? [];
  const exercises = exercisesQuery.data ?? [];
  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const progressionById: ProgressionById | null = useMemo(
    () => (progressionQuery.data ? new Map(progressionQuery.data.map((p) => [p.exerciseId, p])) : null),
    [progressionQuery.data],
  );

  const [editingId, setEditingId] = useState<string | 'new' | null>(null);

  if (programsQuery.isPending || exercisesQuery.isPending) {
    return <p className="text-slate-400">{t('common.loading')}</p>;
  }

  const editing = editingId === 'new' ? null : programs.find((p) => p.id === editingId);
  if (editingId === 'new' || editing) {
    return (
      <ProgramForm
        key={editingId}
        program={editing ?? undefined}
        exercises={exercises}
        progressionById={progressionById}
        onDone={() => setEditingId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl text-slate-100">{t('programs.title')}</h1>
        <button className="btn-primary" onClick={() => setEditingId('new')}>
          {t('programs.newProgram')}
        </button>
      </div>

      {programs.length === 0 && (
        <p className="text-slate-400">{t('programs.emptyState')}</p>
      )}

      <div className="space-y-4">
        {programs.map((program) => (
          <ProgramCard
            key={program.id}
            program={program}
            exerciseById={exerciseById}
            progressionById={progressionById}
            onEdit={() => setEditingId(program.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ProgramCard({
  program,
  exerciseById,
  progressionById,
  onEdit,
}: {
  program: Program;
  exerciseById: Map<string, { name: string; category: string }>;
  progressionById: ProgressionById | null;
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

      <div className="divide-y divide-surface-border">
        {program.programExercises.map((pe) => (
          <div
            key={pe.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm first:pt-0 last:pb-0"
          >
            <span className="min-w-0 text-slate-200">
              {exerciseById.get(pe.exerciseId)?.name ?? pe.exercise.name}{' '}
              <span className="text-slate-400">×{pe.targetSets}</span>
              {pe.lockSets && (
                <span role="img" aria-label={t('programs.setsLocked')} title={t('programs.setsLocked')} className="ml-1.5 inline-flex align-[-2px] text-hint">
                  <LockIcon size={15} />
                </span>
              )}
            </span>
            {progressionById && (
              <TryMoreCountdown
                progression={progressionById.get(pe.exerciseId)}
                threshold={
                  pe.tryMoreAfterWorkouts ?? defaultThresholdOf(exerciseById.get(pe.exerciseId)?.category ?? pe.exercise.category)
                }
              />
            )}
          </div>
        ))}
      </div>

    </div>
  );
}

function TryMoreCountdown({
  progression,
  threshold,
}: {
  progression: ExerciseProgression | undefined;
  threshold: number;
}) {
  return <TryMoreStatusBadge status={tryMoreStatus(progression, threshold)} />;
}


function ProgramForm({
  program,
  exercises,
  progressionById,
  onDone,
}: {
  program?: Program;
  exercises: ExerciseOption[];
  progressionById: ProgressionById | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const createMutation = useCreateProgramMutation();
  const updateMutation = useUpdateProgramMutation(program?.id ?? '');

  // The parent remounts the form per program (key), so no resync effect.
  const [name, setName] = useState(program?.name ?? '');
  const [blocks, setBlocks] = useState<EditableExercise[]>(() => toEditable(program));
  const [addOpen, setAddOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The form replaces the list - start at its top, not where the list was scrolled.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const usedIds = useMemo(() => new Set(blocks.map((b) => b.exerciseId)), [blocks]);
  const availableExercises = exercises.filter((e) => !usedIds.has(e.id));
  const categoryLabel = (category: string) => t(`exercises.category.${category}`);

  function addExercise(exerciseId: string) {
    // Removed by a stray tap and added back: keep its saved settings.
    const saved = toEditable(program).find((b) => b.exerciseId === exerciseId);
    setBlocks((prev) => [
      ...prev,
      saved ?? { exerciseId, targetSets: 3, tryMoreAfterWorkouts: null, lockSets: false, sessionsDone: null },
    ]);
    setAddOpen(false);
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

    const body = {
      name: trimmedName,
      exercises: blocks.map((b) => {
        const threshold = b.tryMoreAfterWorkouts ?? defaultThresholdOf(exerciseById.get(b.exerciseId)?.category);
        return {
          exerciseId: b.exerciseId,
          targetSets: b.targetSets,
          tryMoreAfterWorkouts: b.tryMoreAfterWorkouts,
          lockSets: b.lockSets,
          // Only a moved scale is sent, clamped to what the user sees -
          // otherwise an invisible shift would be stored.
          ...(b.sessionsDone != null ? { sessionsDone: Math.min(b.sessionsDone, threshold) } : {}),
        };
      }),
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
    <div className="mx-auto max-w-xl">
      <div className="-mt-2 mb-4 flex items-center gap-1 border-b border-surface-border pb-2">
        <button
          type="button"
          aria-label={t('programs.form.back')}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-slate-100 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={onDone}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1 className="flex-1 text-[17px] font-bold text-slate-100">
          {program ? t('programs.form.editTitle') : t('programs.form.newTitle')}
        </h1>
        <span className="text-xs text-slate-400">{t('programs.exerciseCount', { count: blocks.length })}</span>
      </div>

      <div className="space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-slate-400">{t('programs.form.nameLabel')}</span>
          <input
            className="h-[52px] rounded-xl border border-surface-border bg-surface-raised px-3.5 text-xl font-bold text-white placeholder:text-base placeholder:font-normal placeholder:text-slate-500 focus:border-accent focus:outline-none"
            placeholder={t('programs.form.namePlaceholder')}
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {blocks.length > 0 && (
          <h2 className="-mb-1.5 text-[13px] font-semibold text-slate-400">{t('programs.form.exercisesHeading')}</h2>
        )}
        {blocks.map((block, index) => {
          const exercise = exerciseById.get(block.exerciseId);
          if (!exercise) return null;
          return (
            <ExerciseBlockCard
              key={block.exerciseId}
              block={block}
              exercise={exercise}
              categoryLabel={categoryLabel(exercise.category)}
              first={index === 0}
              last={index === blocks.length - 1}
              progression={progressionById?.get(block.exerciseId)}
              progressionLoaded={progressionById != null}
              onChange={(patch) => updateBlock(block.exerciseId, patch)}
              onMove={(direction) => moveBlock(block.exerciseId, direction)}
              onRemove={() => removeExercise(block.exerciseId)}
            />
          );
        })}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={addOpen}
            disabled={availableExercises.length === 0}
            className="flex h-[52px] items-center justify-center gap-2 rounded-xl border border-dashed border-accent/40 text-[15px] font-bold text-accent-hover hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => setAddOpen((v) => !v)}
          >
            <PlusIcon />
            {t('programs.form.addExercise')}
          </button>
          {addOpen && (
            <div
              role="listbox"
              aria-label={t('programs.form.availableLabel')}
              className="flex animate-pop-in flex-col rounded-xl border border-surface-border bg-surface-raised p-1"
            >
              {availableExercises.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex min-h-12 items-center justify-between gap-2 rounded-lg px-3 text-left text-[15px] font-medium text-slate-100 hover:bg-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  onClick={() => addExercise(e.id)}
                >
                  <span>{e.name}</span>
                  <span className="shrink-0 text-xs text-hint">{categoryLabel(e.category)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <section className="rounded-[14px] border border-surface-border bg-surface-raised px-3.5 py-1">
          <button
            type="button"
            aria-expanded={helpOpen}
            className="flex min-h-12 w-full items-center gap-2.5 text-left text-[15px] font-semibold text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => setHelpOpen((v) => !v)}
          >
            <span className="flex text-slate-400">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </svg>
            </span>
            <span className="flex-1">{t('programs.form.helpTitle')}</span>
            <span className={`flex text-hint transition-transform motion-reduce:transition-none ${helpOpen ? 'rotate-180' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>
          {/* Height animates 0fr -> 1fr (open and close). `invisible` when
              closed keeps the hidden text out of Tab and screen readers -
              visibility switches at the end of the closing transition. */}
          <div
            className={`grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
              helpOpen ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex flex-col gap-2.5 pb-3.5 pt-0.5 text-[13px] leading-normal text-slate-300">
                <p>{t('programs.form.helpProgress')}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['large', 'small', 'bodyweight'] as const).map((c) => (
                    <div key={c} className="flex flex-col gap-0.5 rounded-lg bg-surface p-2">
                      <b className="text-xl text-white">{DEFAULT_TRY_MORE_AFTER_WORKOUTS[c]}</b>
                      <span className="text-xs text-slate-400">{categoryLabel(c).toLocaleLowerCase()}</span>
                    </div>
                  ))}
                </div>
                <p>{t('programs.form.helpStandard')}</p>
                <p>{t('programs.form.helpBreaks')}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Pinned to the bottom of the screen while the form scrolls. */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-surface-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {error && (
          <p role="alert" className="mb-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex gap-2.5">
          <button type="button" className="btn-secondary h-[52px] px-[18px] text-[15px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" onClick={onDone}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary h-[52px] flex-1 text-base font-extrabold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? t('programs.form.saving') : t('programs.form.saveButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExerciseBlockCard({
  block,
  exercise,
  categoryLabel,
  first,
  last,
  progression,
  progressionLoaded,
  onChange,
  onMove,
  onRemove,
}: {
  block: EditableExercise;
  exercise: ExerciseOption;
  categoryLabel: string;
  first: boolean;
  last: boolean;
  progression: ExerciseProgression | undefined;
  progressionLoaded: boolean;
  onChange: (patch: Partial<EditableExercise>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const defaultValue = defaultThresholdOf(exercise.category);
  const threshold = block.tryMoreAfterWorkouts ?? defaultValue;
  const custom = block.tryMoreAfterWorkouts != null;

  // Equal to the default = no own value (null), so a later change of the
  // default still applies to this exercise.
  function setThreshold(value: number) {
    onChange({ tryMoreAfterWorkouts: value === defaultValue ? null : value });
  }

  return (
    <article className="flex flex-col gap-3 rounded-[14px] border border-surface-border bg-surface-raised pb-3.5 pl-3.5 pr-3 pt-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-base font-semibold text-slate-100">{exercise.name}</span>
        <ExerciseMenu name={exercise.name} first={first} last={last} onMove={onMove} onRemove={onRemove} />
      </div>

      <div className="flex items-center gap-2 pr-3">
        <span className="flex-1 text-sm text-slate-400">{t('programs.form.setsLabel')}</span>
        <button
          type="button"
          aria-pressed={block.lockSets}
          aria-label={t('programs.form.lockSetsLabel')}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            block.lockSets
              ? 'border-slate-600 bg-surface-border text-slate-100'
              : 'border-accent/40 bg-transparent text-accent-hover hover:border-accent'
          }`}
          onClick={() => onChange({ lockSets: !block.lockSets })}
        >
          <LockIcon open={!block.lockSets} />
        </button>
        <Stepper
          label={t('programs.form.setsGroupLabel')}
          value={block.targetSets}
          min={1}
          max={SETS_MAX}
          onChange={(targetSets) => onChange({ targetSets })}
        />
      </div>
      <span className={`-mt-1.5 text-xs ${block.lockSets ? 'text-slate-300' : 'text-hint'}`}>
        {block.lockSets
          ? t('programs.form.lockSetsOn', { count: block.targetSets })
          : t('programs.form.lockSetsOff')}
      </span>

      <div className="flex flex-col gap-2 rounded-xl bg-surface px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex flex-1 flex-col gap-px">
            <span className="text-[13px] text-slate-400">{t('progressStatus.toTryMore')}</span>
            <span className="text-xs text-hint">
              {custom
                ? t('programs.form.thresholdOwn', { count: defaultValue })
                : t('programs.form.thresholdDefault', { count: defaultValue, category: categoryLabel.toLocaleLowerCase() })}
            </span>
          </span>
          <Stepper
            label={t('programs.form.thresholdGroupLabel')}
            value={threshold}
            min={1}
            max={TRY_MORE_MAX}
            onChange={setThreshold}
          />
        </div>
        <SessionsDoneScale
          threshold={threshold}
          progression={progression}
          progressionLoaded={progressionLoaded}
          sessionsDone={block.sessionsDone}
          onChange={(sessionsDone) => onChange({ sessionsDone })}
        />
        {custom && (
          <button
            type="button"
            className="-mb-1.5 -mt-2.5 min-h-11 self-start text-[13px] font-semibold text-accent-hover hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => onChange({ tryMoreAfterWorkouts: null })}
          >
            {t('programs.form.resetThreshold', { count: defaultValue })}
          </button>
        )}
      </div>
    </article>
  );
}

// "Already without progress": the workouts-without-progress counter on a
// 0..N scale. Tapping segment k sets k+1; tapping the last filled one again
// sets k. Moving it shifts the counter until the next real progress.
function SessionsDoneScale({
  threshold,
  progression,
  progressionLoaded,
  sessionsDone,
  onChange,
}: {
  threshold: number;
  progression: ExerciseProgression | undefined;
  progressionLoaded: boolean;
  // Position set in this form; null = untouched.
  sessionsDone: number | null;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  const current = progression?.sessionsSinceProgress ?? null;
  const raw = sessionsDone ?? current;
  const done = raw != null ? Math.min(raw, threshold) : 0;

  // Only meaningful with some history.
  let disabledHint: string | null = null;
  if (!progressionLoaded) disabledHint = t('common.loading');
  // Missing from the overview = archived exercise; no_data = never done.
  else if (raw == null) disabledHint = t('programs.form.exerciseTryMoreNoHistory');
  const disabled = disabledHint != null;
  const due = !disabled && done >= threshold;
  // The nudge fires at the smallest count across all programs with this
  // exercise - warn when another program's is below this scale.
  const effective = progression?.tryMoreAfterWorkouts ?? null;
  const earlierElsewhere = effective != null && effective < threshold ? effective : null;
  const filled = due ? 'bg-warn' : 'bg-accent';

  return (
    <>
      {threshold <= MAX_SEGMENTS ? (
        <div role="group" aria-label={t('programs.form.segmentsLabel')} className="flex gap-1">
          {Array.from({ length: threshold }, (_, k) => (
            <button
              key={k}
              type="button"
              disabled={disabled}
              aria-label={t('programs.form.segmentAria', { done: k + 1, total: threshold })}
              aria-pressed={!disabled && k < done}
              className="flex h-6 flex-1 items-center disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onClick={() => onChange(done === k + 1 ? k : k + 1)}
            >
              <span
                className={`h-1.5 w-full rounded-full transition-colors motion-reduce:transition-none ${
                  !disabled && k < done ? filled : 'bg-slate-600'
                } ${disabled ? 'opacity-40' : ''}`}
              />
            </button>
          ))}
        </div>
      ) : (
        <input
          type="range"
          min={0}
          max={threshold}
          step={1}
          className="h-6 w-full cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={t('programs.form.exerciseTryMoreDoneLabel')}
          disabled={disabled}
          value={done}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
      <span className="text-xs text-slate-400">
        {disabledHint ?? (
          <>
            <b className={due ? 'text-warn' : 'text-slate-100'}>{done}</b>{' '}
            {threshold <= MAX_SEGMENTS
              ? t('programs.form.doneOf', { count: threshold })
              : t('programs.form.doneOfSlider', { count: threshold })}
          </>
        )}
      </span>
      {earlierElsewhere != null && (
        <span className="text-xs text-warn">{t('programs.form.exerciseTryMoreEarlierElsewhere', { count: earlierElsewhere })}</span>
      )}
    </>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  const button =
    'flex h-11 w-11 items-center justify-center rounded-lg bg-surface-border text-slate-100 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label={t('programs.form.decrease')}
        className={button}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
      <span aria-live="polite" className="min-w-10 text-center text-[17px] font-bold tabular-nums text-slate-100">
        {value}
      </span>
      <button
        type="button"
        aria-label={t('programs.form.increase')}
        className={button}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <PlusIcon />
      </button>
    </div>
  );
}

// "⋯" on an exercise: move up / down (inactive at the ends) and remove.
// Closes on Escape and on a tap outside, like Popconfirm.
function ExerciseMenu({
  name,
  first,
  last,
  onMove,
  onRemove,
}: {
  name: string;
  first: boolean;
  last: boolean;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const item =
    'flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-left text-[15px] font-medium hover:bg-surface-border disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  return (
    <div className="relative -my-2 -mr-1.5" ref={ref}>
      <button
        type="button"
        aria-label={t('programs.form.exerciseMenuLabel', { name })}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-surface-border hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          open ? 'bg-surface-border' : ''
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-20 flex w-52 origin-top-right animate-pop-in flex-col rounded-xl border border-surface-border bg-surface-raised p-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            disabled={first}
            className={`${item} text-slate-100`}
            onClick={() => {
              setOpen(false);
              onMove(-1);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
            {t('programs.form.moveUp')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={last}
            className={`${item} text-slate-100`}
            onClick={() => {
              setOpen(false);
              onMove(1);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
            {t('programs.form.moveDown')}
          </button>
          <div className="mx-1.5 my-1 h-px bg-surface-border" />
          <button
            type="button"
            role="menuitem"
            className={`${item} font-semibold text-red-400`}
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            </svg>
            {t('programs.form.removeFromProgram')}
          </button>
        </div>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
