import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Exercise } from '../../../../types/index.js';
import { ExercisesApi } from '../exercises.api.js';
import { exercisesKeys } from '../exercises.keys.js';
import type { CreateExerciseBody } from '../exercises.types.js';

export const useCreateExerciseMutation = (): UseMutationResult<Exercise, Error, CreateExerciseBody> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: exercisesKeys.create.queryKey,
    mutationFn: async (payload) => {
      const { data } = await ExercisesApi.create(payload);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: exercisesKeys.list.queryKey });
    },
  });
};
