import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Workout } from '../../../../types/index.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';
import { progressionKeys } from '../../progression/progression.keys.js';

export const useFinishWorkoutMutation = (id: string): UseMutationResult<Workout, Error, void> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: workoutsKeys.finish.queryKey,
    mutationFn: async () => {
      const { data } = await WorkoutsApi.finish(id);
      return data;
    },
    onSuccess: async (data) => {
      // The response is the bare workout row - keep the cached exercises
      // (and their progressAt) instead of replacing them with nothing.
      queryClient.setQueryData<Workout>(workoutsKeys.detail(id).queryKey, (old) => (old ? { ...old, ...data } : data));
      await queryClient.invalidateQueries({ queryKey: workoutsKeys.list._def });
      // The try-more countdowns on the Programs page come from here.
      await queryClient.invalidateQueries({ queryKey: progressionKeys._def });
    },
  });
};
