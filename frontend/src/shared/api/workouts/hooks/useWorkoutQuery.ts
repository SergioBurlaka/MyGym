import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Workout } from '../../../../types/index.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';

export const useWorkoutQuery = (id: string | undefined): UseQueryResult<Workout, Error> =>
  useQuery({
    queryKey: workoutsKeys.detail(id ?? '').queryKey,
    queryFn: async () => {
      const { data } = await WorkoutsApi.getById(id as string);
      return data;
    },
    enabled: !!id,
  });
