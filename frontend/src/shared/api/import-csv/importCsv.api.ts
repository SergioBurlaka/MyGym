import { api } from '../../../api/client.js';
import type { ImportSummary } from '../../../types/index.js';

export const ImportCsvApi = {
  async upload(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<ImportSummary>('/import/csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
