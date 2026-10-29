import { api } from '../../../api/client.js';
import type { ActiveWorkout, Workout, WorkoutDateSummary, WorkoutTemplate } from '../../../types/index.js';
import type {
  SaveWorkoutExercisesBody,
  StartWorkoutBody,
  UpdateWorkoutBody,
  WorkoutsListParams,
  WorkoutsPage,
} from './workouts.types.js';

const SAVE_TIMEOUT_MS = 20_000;

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
  async update(id: string, body: UpdateWorkoutBody) {
    return api.patch<Workout>(`/workouts/${id}`, body);
  },
  // With a timeout: on a bad gym network a request can hang with no answer,
  // and the autosave (one at a time) would wait forever instead of retrying.
  // A retry is safe - the PUT replaces the whole list.
  async saveExercises(id: string, body: SaveWorkoutExercisesBody) {
    return api.put<Workout>(`/workouts/${id}/exercises`, body, { timeout: SAVE_TIMEOUT_MS });
  },
  async finish(id: string) {
    return api.post<Workout>(`/workouts/${id}/finish`);
  },
  async active() {
    return api.get<{ workout: ActiveWorkout | null; serverNow: string }>('/workouts/active');
  },
  async setPaused(id: string, paused: boolean) {
    return api.post<Workout>(`/workouts/${id}/${paused ? 'pause' : 'resume'}`);
  },
  async removeSamples() {
    return api.delete<{ removed: number }>('/workouts/samples');
  },
  async remove(id: string) {
    return api.delete(`/workouts/${id}`);
  },
};
