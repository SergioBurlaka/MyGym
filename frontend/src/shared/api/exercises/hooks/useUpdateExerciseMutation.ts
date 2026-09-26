import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Exercise } from '../../../../types/index.js';
import { ExercisesApi } from '../exercises.api.js';
import { exercisesKeys } from '../exercises.keys.js';
import type { UpdateExerciseBody } from '../exercises.types.js';

export const useUpdateExerciseMutation = (): UseMutationResult<
  Exercise,
  Error,
  { id: string; payload: UpdateExerciseBody }
> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: exercisesKeys.update.queryKey,
    mutationFn: async ({ id, payload }) => {
      const { data } = await ExercisesApi.update(id, payload);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: exercisesKeys.list.queryKey });
    },
  });
};
