import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { WorkoutDateSummary } from '../../../../types/index.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';

// `enabled: false` until the caller knows the range (the date picker reports it).
export const useWorkoutDatesQuery = (
  from: string,
  to: string,
  enabled = true,
): UseQueryResult<WorkoutDateSummary[], Error> =>
  useQuery({
    enabled,
    // Paging the date picker: keep the last month's dots until the next arrive.
    placeholderData: keepPreviousData,
    queryKey: workoutsKeys.dates(from, to).queryKey,
    queryFn: async () => {
      const { data } = await WorkoutsApi.dates(from, to);
      return data;
    },
  });
