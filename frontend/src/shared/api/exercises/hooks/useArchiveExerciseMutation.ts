import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { ExercisesApi } from '../exercises.api.js';
import { exercisesKeys } from '../exercises.keys.js';

export const useArchiveExerciseMutation = (): UseMutationResult<unknown, Error, string> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: exercisesKeys.archive.queryKey,
    mutationFn: async (id) => {
      return ExercisesApi.archive(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: exercisesKeys.list.queryKey });
    },
  });
};
