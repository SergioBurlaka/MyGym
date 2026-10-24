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
      // The response is the bare workout row - keep the cached exercises.
      queryClient.setQueryData<Workout>(workoutsKeys.detail(id).queryKey, (old) => (old ? { ...old, ...data } : data));
      await Promise.all([
        // A new date moves the workout on the progress timeline (progressAt).
        queryClient.invalidateQueries({ queryKey: workoutsKeys.detail(id).queryKey }),
        queryClient.invalidateQueries({ queryKey: workoutsKeys.list._def }),
        queryClient.invalidateQueries({ queryKey: workoutsKeys.templates.queryKey }),
        queryClient.invalidateQueries({ queryKey: workoutsKeys.dates._def }),
      ]);
    },
  });
};
