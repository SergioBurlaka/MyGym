import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';
import { progressionKeys } from '../../progression/progression.keys.js';
import { settingsKeys } from '../../settings/settings.keys.js';

export const useRemoveSampleWorkoutsMutation = (): UseMutationResult<{ removed: number }, Error, void> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: workoutsKeys.removeSamples.queryKey,
    mutationFn: async () => {
      const { data } = await WorkoutsApi.removeSamples();
      return data;
    },
    onSuccess: async () => {
      // The journal, the calendar (its days and the schedule history it is
      // judged by - moved back to the registration day) and every progress
      // figure built from those workouts.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workoutsKeys._def }),
        queryClient.invalidateQueries({ queryKey: settingsKeys.history.queryKey }),
        queryClient.invalidateQueries({ queryKey: progressionKeys._def }),
      ]);
    },
  });
};
