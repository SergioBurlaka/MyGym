import { createQueryKeys } from '@lukemorales/query-key-factory';
import type { WorkoutsListParams } from './workouts.types.js';

export const workoutsKeys = createQueryKeys('workouts', {
  list: (params: WorkoutsListParams) => [params],
  detail: (id: string) => [id],
  start: null,
  saveExercises: null,
  finish: null,
  remove: null,
});
