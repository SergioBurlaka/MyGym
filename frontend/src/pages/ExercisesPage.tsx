import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '../hooks/usePageTitle.js';
import {
  useArchiveExerciseMutation,
  useCreateExerciseMutation,
  useExercisesQuery,
  useUpdateExerciseMutation,
} from '../shared/api/exercises/index.js';
import type { Equipment, Exercise } from '../types/index.js';
import EquipmentIcon from '../components/EquipmentIcon.js';
import Popconfirm from '../components/Popconfirm.js';
import Select from '../components/Select.js';
import { translateApiError } from '../utils/apiError.js';

const EQUIPMENT_FILTERS: Equipment[] = ['barbell', 'dumbbell', 'bodyweight'];

type ExerciseFormValues = {
  name: string;
  equipment: 'barbell' | 'dumbbell' | 'bodyweight';
  category: 'large' | 'small' | 'bodyweight';
  repRangeMin: number;
  repRangeMax: number;
  weightStepKg: number;
  // Limbs together, or one side after the other (unilateral) - each arm / leg.
  limbs: 'together' | 'arm' | 'leg';
  // Barbell only.
  defaultBarKg: number;
};

const DEFAULT_BAR_OPTIONS = [20, 15, 10, 0];

// The form's values as the API takes them.
function toPayload({ limbs, defaultBarKg, ...rest }: ExerciseFormValues) {
  return {
    ...rest,
    unilateral: limbs !== 'together',
    limb: limbs === 'together' ? null : limbs,
    defaultBarKg: rest.equipment === 'barbell' ? defaultBarKg : null,
  };
}

const emptyForm: ExerciseFormValues = {
  name: '',
  equipment: 'barbell',
  category: 'large',
  repRangeMin: 6,
  repRangeMax: 15,
  weightStepKg: 1.25,
  limbs: 'together',
  defaultBarKg: 20,
};

export default function ExercisesPage() {
  const { t } = useTranslation();
  usePageTitle(t('nav.exercises'));
  const exercisesQuery = useExercisesQuery();
  const createMutation = useCreateExerciseMutation();

  const exercises = exercisesQuery.data ?? [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Equipment | 'all'>('all');

  const visible = filter === 'all' ? exercises : exercises.filter((ex) => ex.equipment === filter);

  if (exercisesQuery.isPending) return <p className="text-slate-400">{t('common.loading')}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl text-slate-100">{t('exercises.title')}</h1>
        <button className="btn-primary flex items-center gap-1.5" onClick={() => setShowForm((v) => !v)}>
          {showForm ? (
            t('exercises.cancelButton')
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t('exercises.addButton')}
            </>
          )}
        </button>
      </div>

      {showForm && (
        <ExerciseForm
          initial={emptyForm}
          submitLabel={t('exercises.form.submit')}
          errorFallbackKey="exercises.form.errorGeneric"
          onSubmit={(values) => createMutation.mutateAsync(toPayload(values))}
          onDone={() => setShowForm(false)}
        />
      )}

      <div role="group" aria-label={t('exercises.filterLabel')} className="flex flex-wrap gap-2">
        {(['all', ...EQUIPMENT_FILTERS] as const).map((value) => {
          const active = filter === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(value)}
              className={`h-9 rounded-full border px-3.5 text-sm transition-colors ${
                active
                  ? 'border-accent-muted bg-accent/15 font-bold text-accent'
                  : 'border-surface-border bg-surface-raised font-semibold text-slate-300 hover:border-slate-600'
              }`}
            >
              {value === 'all' ? t('exercises.filterAll') : t(`exercises.equipment.${value}`)}
            </button>
          );
        })}
      </div>

      {visible.length === 0 && <p className="text-slate-400">{t('exercises.filterEmpty')}</p>}

      <div className="grid gap-2.5 sm:grid-cols-2">
        {visible.map((ex) =>
          editingId === ex.id ? (
            <EditExerciseForm key={ex.id} exercise={ex} onDone={() => setEditingId(null)} />
          ) : (
            <ExerciseCard key={ex.id} exercise={ex} onEdit={() => setEditingId(ex.id)} />
          ),
        )}
      </div>
    </div>
  );
}

function ExerciseCard({ exercise, onEdit }: { exercise: Exercise; onEdit: () => void }) {
  const { t } = useTranslation();
  const archiveMutation = useArchiveExerciseMutation();
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
    <div className="card space-y-2.5 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-100">{exercise.name}</h3>
        <div className="relative -mr-2 shrink-0" ref={menuRef}>
          <button
            type="button"
            aria-label={t('exercises.cardMenuLabel', { name: exercise.name })}
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
                title={t('exercises.archiveConfirmTitle')}
                description={t('exercises.archiveConfirmDescription')}
                confirmText={t('exercises.archiveConfirmText')}
                onConfirm={() => {
                  setMenuOpen(false);
                  archiveMutation.mutate(exercise.id);
                }}
              >
                <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-red-400 hover:bg-surface-border">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                  </svg>
                  {t('exercises.archiveButton')}
                </button>
              </Popconfirm>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[13px] text-slate-200">
        <span className="flex items-center gap-1.5 rounded-lg bg-surface-border px-2.5 py-1">
          <EquipmentIcon equipment={exercise.equipment} filled />
          {t(`exercises.equipment.${exercise.equipment}`)}
        </span>
        <span className="rounded-lg bg-surface-border px-2.5 py-1">
          {t('exercises.repsChip', { min: exercise.repRangeMin, max: exercise.repRangeMax })}
        </span>
        <span className="rounded-lg bg-surface-border px-2.5 py-1 text-slate-400">
          {t('exercises.stepLabel')}{' '}
          <b className="font-semibold text-slate-200">
            {t('exercises.stepChip', { step: Number(exercise.weightStepKg).toFixed(2) })}
          </b>
        </span>
      </div>
    </div>
  );
}

function EditExerciseForm({ exercise, onDone }: { exercise: Exercise; onDone: () => void }) {
  const { t } = useTranslation();
  const updateMutation = useUpdateExerciseMutation();

  return (
    <ExerciseForm
      initial={{
        name: exercise.name,
        equipment: exercise.equipment,
        category: exercise.category,
        repRangeMin: exercise.repRangeMin,
        repRangeMax: exercise.repRangeMax,
        weightStepKg: Number(exercise.weightStepKg),
        limbs: exercise.unilateral ? (exercise.limb ?? 'arm') : 'together',
        defaultBarKg: exercise.defaultBarKg != null ? Number(exercise.defaultBarKg) : 20,
      }}
      submitLabel={t('common.save')}
      errorFallbackKey="exercises.form.errorGenericUpdate"
      onSubmit={(values) => updateMutation.mutateAsync({ id: exercise.id, payload: toPayload(values) })}
      onDone={onDone}
      onCancel={onDone}
      className="sm:col-span-2"
    />
  );
}

function ExerciseForm({
  initial,
  submitLabel,
  errorFallbackKey,
  onSubmit,
  onDone,
  onCancel,
  className = '',
}: {
  initial: ExerciseFormValues;
  submitLabel: string;
  errorFallbackKey: string;
  onSubmit: (values: ExerciseFormValues) => Promise<unknown>;
  onDone: () => void;
  onCancel?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function categoryDefaults(category: ExerciseFormValues['category']) {
    if (category === 'large') return { repRangeMin: 6, repRangeMax: 15, weightStepKg: 1.25 };
    if (category === 'small') return { repRangeMin: 6, repRangeMax: 20, weightStepKg: 0.5 };
    return { repRangeMin: 6, repRangeMax: 30, weightStepKg: 0.5 };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(form);
      onDone();
    } catch (err) {
      setError(translateApiError(err, t, errorFallbackKey));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`card space-y-4 ${className}`}>
      <div>
        <label className="label">{t('exercises.form.name')}</label>
        <input
          className="input"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">{t('exercises.form.equipment')}</label>
          <Select
            value={form.equipment}
            onChange={(v) => setForm((f) => ({ ...f, equipment: v as any }))}
            options={[
              { value: 'barbell', label: t('exercises.equipment.barbell') },
              { value: 'dumbbell', label: t('exercises.equipment.dumbbell') },
              { value: 'bodyweight', label: t('exercises.equipment.bodyweight') },
            ]}
          />
        </div>
        <div className="col-span-2">
          <label className="label">{t('exercises.form.category')}</label>
          <Select
            value={form.category}
            onChange={(v) => {
              const category = v as ExerciseFormValues['category'];
              setForm((f) => ({ ...f, category, ...categoryDefaults(category) }));
            }}
            options={[
              { value: 'large', label: t('exercises.category.largeWithRange') },
              { value: 'small', label: t('exercises.category.smallWithRange') },
              { value: 'bodyweight', label: t('exercises.category.bodyweightWithRange') },
            ]}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">{t('exercises.form.repRangeMin')}</label>
          <input
            type="text"
            inputMode="numeric"
            className="input"
            value={form.repRangeMin}
            onChange={(e) => setForm((f) => ({ ...f, repRangeMin: Number(e.target.value) }))}
          />
        </div>
        <div>
          <label className="label">{t('exercises.form.repRangeMax')}</label>
          <input
            type="text"
            inputMode="numeric"
            className="input"
            value={form.repRangeMax}
            onChange={(e) => setForm((f) => ({ ...f, repRangeMax: Number(e.target.value) }))}
          />
        </div>
        <div>
          <label className="label">{t('exercises.form.weightStep')}</label>
          <input
            type="text"
            inputMode="decimal"
            className="input"
            value={form.weightStepKg}
            onChange={(e) => setForm((f) => ({ ...f, weightStepKg: Number(e.target.value) }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="col-span-2">
          <label className="label">{t('exercises.form.limbs')}</label>
          <Select
            value={form.limbs}
            onChange={(v) => setForm((f) => ({ ...f, limbs: v as ExerciseFormValues['limbs'] }))}
            options={[
              { value: 'together', label: t('exercises.limbs.together') },
              { value: 'arm', label: t('exercises.limbs.arm') },
              { value: 'leg', label: t('exercises.limbs.leg') },
            ]}
          />
        </div>
        {form.equipment === 'barbell' && (
          <div>
            <label className="label">{t('exercises.form.defaultBar')}</label>
            <Select
              value={String(form.defaultBarKg)}
              onChange={(v) => setForm((f) => ({ ...f, defaultBarKg: Number(v) }))}
              options={(DEFAULT_BAR_OPTIONS.includes(form.defaultBarKg)
                ? DEFAULT_BAR_OPTIONS
                : [...DEFAULT_BAR_OPTIONS, form.defaultBarKg]
              ).map((kg) => ({
                value: String(kg),
                label:
                  kg === 0
                    ? t('workout.barNone')
                    : kg === 10
                      ? t('workout.barEz', { kg })
                      : t('workout.barKg', { kg }),
              }))}
            />
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? t('common.saving') : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
