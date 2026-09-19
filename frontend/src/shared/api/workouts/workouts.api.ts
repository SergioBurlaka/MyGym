import { api } from '../../../api/client.js';
import type { Workout, WorkoutDateSummary, WorkoutTemplate } from '../../../types/index.js';
import type { SaveWorkoutExercisesBody, StartWorkoutBody, WorkoutsListParams, WorkoutsPage } from './workouts.types.js';

export const WorkoutsApi = {
  async list(params: WorkoutsListParams) {
    return api.get<WorkoutsPage>('/workouts', { params });
  },
  async getById(id: string) {
    return api.get<Workout>(`/workouts/${id}`);
  },
  async start(body: StartWorkoutBody = {}) {
    return api.post<Workout>('/workouts', body);
  },
  async templates() {
    return api.get<WorkoutTemplate[]>('/workouts/templates');
  },
  async dates(from: string, to: string) {
    return api.get<WorkoutDateSummary[]>('/workouts/dates', { params: { from, to } });
  },
  async updateLabel(id: string, programLabel: string | null) {
    return api.patch<Workout>(`/workouts/${id}`, { programLabel });
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
