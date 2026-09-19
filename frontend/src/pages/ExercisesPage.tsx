import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client.js';
import type { Exercise } from '../types/index.js';

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
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await api.get<Exercise[]>('/exercises');
    setExercises(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/exercises', form);
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Не вдалося додати вправу');
    }
  }

  async function handleArchive(id: string) {
    if (!confirm('Прибрати цю вправу зі списку?')) return;
    await api.delete(`/exercises/${id}`);
    await load();
  }

  function categoryDefaults(category: typeof form.category) {
    if (category === 'large') return { repRangeMin: 6, repRangeMax: 15, weightStepKg: 1.25 };
    if (category === 'small') return { repRangeMin: 6, repRangeMax: 20, weightStepKg: 0.5 };
    return { repRangeMin: 6, repRangeMax: 30, weightStepKg: 0.5 };
  }

  if (loading) return <p className="text-slate-400">Завантаження…</p>;

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
              <select
                className="input"
                value={form.equipment}
                onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value as any }))}
              >
                <option value="barbell">Штанга</option>
                <option value="dumbbell">Гантелі</option>
                <option value="bodyweight">Вага тіла</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Категорія (правило прогресії)</label>
              <select
                className="input"
                value={form.category}
                onChange={(e) => {
                  const category = e.target.value as any;
                  setForm((f) => ({ ...f, category, ...categoryDefaults(category) }));
                }}
              >
                <option value="large">{CATEGORY_LABEL.large}</option>
                <option value="small">{CATEGORY_LABEL.small}</option>
                <option value="bodyweight">{CATEGORY_LABEL.bodyweight}</option>
              </select>
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
              <button className="btn-ghost text-red-400" onClick={() => handleArchive(ex.id)}>
                Прибрати
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
