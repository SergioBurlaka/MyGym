import { useState, type FormEvent } from 'react';
import { useArchiveExerciseMutation, useCreateExerciseMutation, useExercisesQuery } from '../shared/api/exercises/index.js';
import Popconfirm from '../components/Popconfirm.js';
import Select from '../components/Select.js';

const CATEGORY_LABEL: Record<string, string> = {
  large: 'Велика група (6-15, крок 1.25 кг)',
  small: 'Мала група (6-20, крок 0.5 кг)',
  bodyweight: 'Без ваги (6-30)',
};

const emptyForm = {
  name: '',
  equipment: 'barbell' as 'barbell' | 'dumbbell' | 'bodyweight',
  category: 'large' as 'large' | 'small' | 'bodyweight',
  repRangeMin: 6,
  repRangeMax: 15,
  weightStepKg: 1.25,
};

export default function ExercisesPage() {
  const exercisesQuery = useExercisesQuery();
  const createMutation = useCreateExerciseMutation();
  const archiveMutation = useArchiveExerciseMutation();

  const exercises = exercisesQuery.data ?? [];
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createMutation.mutateAsync(form);
      setForm(emptyForm);
      setShowForm(false);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Не вдалося додати вправу');
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

  if (exercisesQuery.isPending) return <p className="text-slate-400">Завантаження…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl text-slate-100">Вправи</h1>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Скасувати' : '+ Додати вправу'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-4">
          <div>
            <label className="label">Назва</label>
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Обладнання</label>
              <Select
                value={form.equipment}
                onChange={(v) => setForm((f) => ({ ...f, equipment: v as any }))}
                options={[
                  { value: 'barbell', label: 'Штанга' },
                  { value: 'dumbbell', label: 'Гантелі' },
                  { value: 'bodyweight', label: 'Вага тіла' },
                ]}
              />
            </div>
            <div className="col-span-2">
              <label className="label">Категорія (правило прогресії)</label>
              <Select
                value={form.category}
                onChange={(v) => {
                  const category = v as typeof form.category;
                  setForm((f) => ({ ...f, category, ...categoryDefaults(category) }));
                }}
                options={[
                  { value: 'large', label: CATEGORY_LABEL.large },
                  { value: 'small', label: CATEGORY_LABEL.small },
                  { value: 'bodyweight', label: CATEGORY_LABEL.bodyweight },
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Мін. повторень</label>
              <input
                type="number"
                className="input"
                value={form.repRangeMin}
                onChange={(e) => setForm((f) => ({ ...f, repRangeMin: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label">Макс. повторень</label>
              <input
                type="number"
                className="input"
                value={form.repRangeMax}
                onChange={(e) => setForm((f) => ({ ...f, repRangeMax: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label">Крок ваги, кг</label>
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
          <button type="submit" className="btn-primary">Зберегти вправу</button>
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {exercises.map((ex) => (
          <div key={ex.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg text-slate-100">{ex.name}</h3>
                <p className="text-xs text-slate-400">
                  {ex.equipment === 'barbell' ? 'Штанга' : ex.equipment === 'dumbbell' ? 'Гантелі' : 'Вага тіла'} ·{' '}
                  {ex.repRangeMin}-{ex.repRangeMax} повт. · крок {ex.weightStepKg} кг
                </p>
              </div>
              <Popconfirm
                title="Прибрати вправу"
                description="Вправу буде прибрано зі списку. Історія підходів у вже збережених тренуваннях не зникне."
                confirmText="Так, прибрати"
                onConfirm={() => handleArchive(ex.id)}
              >
                <button className="btn-ghost text-red-400">Прибрати</button>
              </Popconfirm>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
