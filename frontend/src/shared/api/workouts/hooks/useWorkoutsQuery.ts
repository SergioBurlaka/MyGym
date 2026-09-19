import { useQuery, keepPreviousData, type UseQueryResult } from '@tanstack/react-query';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';
import type { WorkoutsListParams, WorkoutsPage } from '../workouts.types.js';

export const useWorkoutsQuery = (
  params: WorkoutsListParams = {},
): UseQueryResult<WorkoutsPage, Error> =>
  useQuery({
    queryKey: workoutsKeys.list(params).queryKey,
    queryFn: async () => {
      const { data } = await WorkoutsApi.list(params);
      return data;
    },
    placeholderData: keepPreviousData,
  });
