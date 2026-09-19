import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Workout } from '../../../../types/index.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';

export const useFinishWorkoutMutation = (id: string): UseMutationResult<Workout, Error, void> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: workoutsKeys.finish.queryKey,
    mutationFn: async () => {
      const { data } = await WorkoutsApi.finish(id);
      return data;
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(workoutsKeys.detail(id).queryKey, data);
      await queryClient.invalidateQueries({ queryKey: workoutsKeys.list._def });
    },
  });
};
