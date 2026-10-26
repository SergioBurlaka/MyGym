import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ActiveWorkout } from '../../../../types/index.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';

// The header timer's workout. Polled every minute (and on focus, the
// default) so it notices what this tab didn't do itself: the auto-finish
// sweep, or a workout started/finished on another device or via MCP.
export const useActiveWorkoutQuery = (enabled = true): UseQueryResult<ActiveWorkout | null, Error> =>
  useQuery({
    queryKey: workoutsKeys.active.queryKey,
    queryFn: async () => {
      const { data } = await WorkoutsApi.active();
      return data.workout;
    },
    enabled,
    staleTime: 0,
    refetchInterval: 60_000,
  });
