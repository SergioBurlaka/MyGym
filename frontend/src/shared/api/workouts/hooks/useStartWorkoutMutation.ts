import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Workout } from '../../../../types/index.js';
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
    },
  });
};
