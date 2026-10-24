import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Workout } from '../../../../types/index.js';
import { programsKeys } from '../../programs/programs.keys.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';
import type { StartWorkoutBody } from '../workouts.types.js';

export const useStartWorkoutMutation = (): UseMutationResult<Workout, Error, StartWorkoutBody | undefined> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: workoutsKeys.start.queryKey,
    mutationFn: async (body?: StartWorkoutBody) => {
      const { data } = await WorkoutsApi.start(body ?? {});
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workoutsKeys.list._def });
      // Another workout's progressAt depends on this one - mark every open
      // workout page stale (refetched when next shown), without fetching now.
      await queryClient.invalidateQueries({ queryKey: workoutsKeys.detail._def, refetchType: 'none' });
      // Starting a workout from a Program shifts the rotation - the next
      // suggestion depends on which program this one just used.
      await queryClient.invalidateQueries({ queryKey: programsKeys.suggestion.queryKey });
    },
  });
};
