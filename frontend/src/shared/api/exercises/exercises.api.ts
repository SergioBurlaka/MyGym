import { api } from '../../../api/client.js';
import type { Exercise } from '../../../types/index.js';
import type { CreateExerciseBody, UpdateExerciseBody } from './exercises.types.js';

export const ExercisesApi = {
  async list() {
    return api.get<Exercise[]>('/exercises');
  },
  async create(payload: CreateExerciseBody) {
    return api.post<Exercise>('/exercises', payload);
  },
  async update(id: string, payload: UpdateExerciseBody) {
    return api.patch<Exercise>(`/exercises/${id}`, payload);
  },
  async archive(id: string) {
    return api.delete(`/exercises/${id}`);
  },
};
