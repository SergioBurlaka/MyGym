import { api } from '../../../api/client.js';
import type { Workout } from '../../../types/index.js';
import type { SaveWorkoutExercisesBody, WorkoutsListParams, WorkoutsPage } from './workouts.types.js';

export const WorkoutsApi = {
  async list(params: WorkoutsListParams) {
    return api.get<WorkoutsPage>('/workouts', { params });
  },
  async getById(id: string) {
    return api.get<Workout>(`/workouts/${id}`);
  },
  async start() {
    return api.post<Workout>('/workouts', {});
  },
  async saveExercises(id: string, body: SaveWorkoutExercisesBody) {
    return api.put<Workout>(`/workouts/${id}/exercises`, body);
  },
  async finish(id: string) {
    return api.post<Workout>(`/workouts/${id}/finish`);
  },
  async remove(id: string) {
    return api.delete(`/workouts/${id}`);
  },
};
