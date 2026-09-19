import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Workout } from '../../../../types/index.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';

export const useStartWorkoutMutation = (): UseMutationResult<Workout, Error, void> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: workoutsKeys.start.queryKey,
    mutationFn: async () => {
      const { data } = await WorkoutsApi.start();
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workoutsKeys.list._def });
    },
  });
};
