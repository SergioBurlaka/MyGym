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
      // No removeQueries() here: WorkoutFormPage (and its useWorkoutQuery(id)
      // observer) is still mounted at this point — removing an actively
      // watched query makes TanStack Query refetch it immediately, which
      // hits the now-deleted workout and 404s right before navigate('/')
      // unmounts the page. Letting the query go stale and get garbage
      // collected after unmount avoids that spurious request.
      await queryClient.invalidateQueries({ queryKey: workoutsKeys.list._def });
    },
  });
};
