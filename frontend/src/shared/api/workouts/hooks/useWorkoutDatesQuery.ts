import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { WorkoutDateSummary } from '../../../../types/index.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';

export const useWorkoutDatesQuery = (from: string, to: string): UseQueryResult<WorkoutDateSummary[], Error> =>
  useQuery({
    queryKey: workoutsKeys.dates(from, to).queryKey,
    queryFn: async () => {
      const { data } = await WorkoutsApi.dates(from, to);
      return data;
    },
  });
