import { useRef, useState } from 'react';
import { api } from '../api/client.js';
import type { ImportSummary } from '../types/index.js';

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<ImportSummary>('/import/csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSummary(res.data);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Не вдалося імпортувати файл');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl text-slate-100">Імпорт з Google Таблиць</h1>
      <p className="text-sm text-slate-400">
        Експортуйте вашу таблицю тренувань як CSV (Файл → Завантажити → Значення, розділені комами) і
        завантажте файл тут. Формат має відповідати вашій оригінальній таблиці: дата на першому підході,
        колонки «вправа» + «вага» по кожній вправі.
      </p>

      <div className="card space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-accent-hover"
        />
        <button className="btn-primary" onClick={handleUpload} disabled={busy}>
          {busy ? 'Імпортуємо…' : 'Імпортувати'}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      {summary && (
        <div className="card space-y-2">
          <h2 className="text-lg text-slate-100">Результат імпорту</h2>
          <ul className="space-y-1 text-sm text-slate-300">
            <li>Імпортовано тренувань: <strong>{summary.workoutsImported}</strong></li>
            <li>Імпортовано підходів: <strong>{summary.setsImported}</strong></li>
            {summary.workoutsSkippedExisting.length > 0 && (
              <li>
                Пропущено (вже існують): {summary.workoutsSkippedExisting.join(', ')}
              </li>
            )}
            {summary.exercisesCreated.length > 0 && (
              <li>Створено нові вправи: {summary.exercisesCreated.join(', ')}</li>
            )}
            {summary.rowsSkipped > 0 && <li>Пропущено рядків (нерозпізнано): {summary.rowsSkipped}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
