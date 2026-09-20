import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useImportCsvMutation } from '../shared/api/import-csv/index.js';
import { translateApiError } from '../utils/apiError.js';

export default function ImportPage() {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportCsvMutation();

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    importMutation.reset();
    try {
      await importMutation.mutateAsync(file);
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      // surfaced via importMutation.error below
    }
  }

  const errorMessage = importMutation.isError
    ? translateApiError(importMutation.error, t, 'import.genericError')
    : null;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl text-slate-100">{t('import.title')}</h1>
      <p className="text-sm text-slate-400">{t('import.description')}</p>

      <div className="card space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-accent-hover"
        />
        <button className="btn-primary" onClick={handleUpload} disabled={importMutation.isPending}>
          {importMutation.isPending ? t('import.importing') : t('import.uploadButton')}
        </button>
      </div>

      {errorMessage && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{errorMessage}</p>}

      {importMutation.data && (
        <div className="card space-y-2">
          <h2 className="text-lg text-slate-100">{t('import.resultTitle')}</h2>
          <ul className="space-y-1 text-sm text-slate-300">
            <li>{t('import.workoutsImported')} <strong>{importMutation.data.workoutsImported}</strong></li>
            <li>{t('import.setsImported')} <strong>{importMutation.data.setsImported}</strong></li>
            {importMutation.data.workoutsSkippedExisting.length > 0 && (
              <li>
                {t('import.skippedExisting')} {importMutation.data.workoutsSkippedExisting.join(', ')}
              </li>
            )}
            {importMutation.data.exercisesCreated.length > 0 && (
              <li>{t('import.exercisesCreated')} {importMutation.data.exercisesCreated.join(', ')}</li>
            )}
            {importMutation.data.rowsSkipped > 0 && (
              <li>{t('import.rowsSkipped')} {importMutation.data.rowsSkipped}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
