import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { WorkoutTemplate } from '../../../../types/index.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';

export const useWorkoutTemplatesQuery = (): UseQueryResult<WorkoutTemplate[], Error> =>
  useQuery({
    queryKey: workoutsKeys.templates.queryKey,
    queryFn: async () => {
      const { data } = await WorkoutsApi.templates();
      return data;
    },
  });
