import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useArchiveExerciseMutation, useCreateExerciseMutation, useExercisesQuery } from '../shared/api/exercises/index.js';
import { useSettingsQuery, useUpdateSettingsMutation } from '../shared/api/settings/index.js';
import Popconfirm from '../components/Popconfirm.js';
import Select from '../components/Select.js';
import { translateApiError } from '../utils/apiError.js';

const WEEKDAYS: { day: number; key: string }[] = [
  { day: 1, key: 'mon' },
  { day: 2, key: 'tue' },
  { day: 3, key: 'wed' },
  { day: 4, key: 'thu' },
  { day: 5, key: 'fri' },
  { day: 6, key: 'sat' },
  { day: 7, key: 'sun' },
];

const emptyForm = {
  name: '',
  equipment: 'barbell' as 'barbell' | 'dumbbell' | 'bodyweight',
  category: 'large' as 'large' | 'small' | 'bodyweight',
  repRangeMin: 6,
  repRangeMax: 15,
  weightStepKg: 1.25,
};

export default function ExercisesPage() {
  const { t } = useTranslation();
  const exercisesQuery = useExercisesQuery();
  const createMutation = useCreateExerciseMutation();
  const archiveMutation = useArchiveExerciseMutation();

  const exercises = exercisesQuery.data ?? [];
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const EQUIPMENT_LABEL: Record<string, string> = {
    barbell: t('exercises.equipment.barbell'),
    dumbbell: t('exercises.equipment.dumbbell'),
    bodyweight: t('exercises.equipment.bodyweight'),
  };

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createMutation.mutateAsync(form);
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setError(translateApiError(err, t, 'exercises.form.errorGeneric'));
    }
  }

  async function handleArchive(id: string) {
    await archiveMutation.mutateAsync(id);
  }

  function categoryDefaults(category: typeof form.category) {
    if (category === 'large') return { repRangeMin: 6, repRangeMax: 15, weightStepKg: 1.25 };
    if (category === 'small') return { repRangeMin: 6, repRangeMax: 20, weightStepKg: 0.5 };
    return { repRangeMin: 6, repRangeMax: 30, weightStepKg: 0.5 };
  }

  if (exercisesQuery.isPending) return <p className="text-slate-400">{t('common.loading')}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl text-slate-100">{t('exercises.title')}</h1>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? t('exercises.cancelButton') : t('exercises.addButton')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-4">
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
                  const category = v as typeof form.category;
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
                type="number"
                className="input"
                value={form.repRangeMin}
                onChange={(e) => setForm((f) => ({ ...f, repRangeMin: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label">{t('exercises.form.repRangeMax')}</label>
              <input
                type="number"
                className="input"
                value={form.repRangeMax}
                onChange={(e) => setForm((f) => ({ ...f, repRangeMax: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label">{t('exercises.form.weightStep')}</label>
              <input
                type="number"
                step="0.25"
                className="input"
                value={form.weightStepKg}
                onChange={(e) => setForm((f) => ({ ...f, weightStepKg: Number(e.target.value) }))}
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="btn-primary">{t('exercises.form.submit')}</button>
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {exercises.map((ex) => (
          <div key={ex.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg text-slate-100">{ex.name}</h3>
                <p className="text-xs text-slate-400">
                  {t('exercises.cardSummary', {
                    equipment: EQUIPMENT_LABEL[ex.equipment],
                    min: ex.repRangeMin,
                    max: ex.repRangeMax,
                    step: ex.weightStepKg,
                  })}
                </p>
              </div>
              <Popconfirm
                title={t('exercises.archiveConfirmTitle')}
                description={t('exercises.archiveConfirmDescription')}
                confirmText={t('exercises.archiveConfirmText')}
                onConfirm={() => handleArchive(ex.id)}
              >
                <button className="btn-ghost text-red-400">{t('exercises.archiveButton')}</button>
              </Popconfirm>
            </div>
          </div>
        ))}
      </div>

      <TrainingScheduleCard />
    </div>
  );
}

function TrainingScheduleCard() {
  const { t } = useTranslation();
  const settingsQuery = useSettingsQuery();
  const updateMutation = useUpdateSettingsMutation();
  const trainingDays = settingsQuery.data?.trainingDays ?? [];

  function toggleDay(day: number) {
    const next = trainingDays.includes(day)
      ? trainingDays.filter((d) => d !== day)
      : [...trainingDays, day];
    updateMutation.mutate(next);
  }

  if (settingsQuery.isPending) return null;

  return (
    <div className="card">
      <h2 className="text-lg text-slate-100">{t('exercises.schedule.title')}</h2>
      <p className="mt-1 text-sm text-slate-400">{t('exercises.schedule.description')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {WEEKDAYS.map(({ day, key }) => {
          const active = trainingDays.includes(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              disabled={updateMutation.isPending}
              className={`w-14 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-surface-border bg-surface-raised text-slate-400 hover:border-slate-600'
              }`}
            >
              {t(`weekdays.${key}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
