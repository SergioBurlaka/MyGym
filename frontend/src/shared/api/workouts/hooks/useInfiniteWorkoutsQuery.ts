import { useInfiniteQuery, type InfiniteData, type UseInfiniteQueryResult } from '@tanstack/react-query';
import type { Workout } from '../../../../types/index.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';
import type { WorkoutsListParams } from '../workouts.types.js';

const PAGE_SIZE = 20;

export const useInfiniteWorkoutsQuery = (
  params: WorkoutsListParams = {},
): UseInfiniteQueryResult<InfiniteData<Workout[]>, Error> => {
  const limit = params.limit ?? PAGE_SIZE;

  return useInfiniteQuery({
    queryKey: workoutsKeys.infiniteList({ ...params, limit }).queryKey,
    queryFn: async ({ pageParam }) => {
      const { data } = await WorkoutsApi.list({ limit, before: pageParam as string | undefined });
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.length === limit ? lastPage[lastPage.length - 1].date : undefined,
  });
};
