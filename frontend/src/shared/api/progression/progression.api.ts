import { api } from '../../../api/client.js';
import type { ExerciseProgression, HistoryPoint } from '../../../types/index.js';

export const ProgressionApi = {
  async list() {
    return api.get<ExerciseProgression[]>('/progression');
  },
  async history(exerciseId: string) {
    return api.get<HistoryPoint[]>(`/progression/${exerciseId}/history`);
  },
};
