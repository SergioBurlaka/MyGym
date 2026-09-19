import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';

export const useDeleteWorkoutMutation = (id: string): UseMutationResult<unknown, Error, void> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: workoutsKeys.remove.queryKey,
    mutationFn: async () => {
      return WorkoutsApi.remove(id);
    },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: workoutsKeys.detail(id).queryKey });
      await queryClient.invalidateQueries({ queryKey: workoutsKeys.list._def });
    },
  });
};
