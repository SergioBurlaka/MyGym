import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Workout } from '../../../../types/index.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';
import type { UpdateWorkoutBody } from '../workouts.types.js';

export const useUpdateWorkoutMutation = (
  id: string,
): UseMutationResult<Workout, Error, UpdateWorkoutBody> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: workoutsKeys.update.queryKey,
    mutationFn: async (patch) => {
      const { data } = await WorkoutsApi.update(id, patch);
      return data;
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(workoutsKeys.detail(id).queryKey, data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workoutsKeys.list._def }),
        queryClient.invalidateQueries({ queryKey: workoutsKeys.templates.queryKey }),
        queryClient.invalidateQueries({ queryKey: workoutsKeys.dates._def }),
      ]);
    },
  });
};
