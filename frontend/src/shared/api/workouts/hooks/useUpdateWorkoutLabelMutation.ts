import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Workout } from '../../../../types/index.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';

export const useUpdateWorkoutLabelMutation = (
  id: string,
): UseMutationResult<Workout, Error, string | null> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: workoutsKeys.updateLabel.queryKey,
    mutationFn: async (programLabel) => {
      const { data } = await WorkoutsApi.updateLabel(id, programLabel);
      return data;
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(workoutsKeys.detail(id).queryKey, data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workoutsKeys.list._def }),
        queryClient.invalidateQueries({ queryKey: workoutsKeys.templates.queryKey }),
      ]);
    },
  });
};
