import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Workout } from '../../../../types/index.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';
import type { SaveWorkoutExercisesBody } from '../workouts.types.js';

export const useSaveWorkoutExercisesMutation = (
  id: string,
): UseMutationResult<Workout, Error, SaveWorkoutExercisesBody> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: workoutsKeys.saveExercises.queryKey,
    mutationFn: async (body) => {
      const { data } = await WorkoutsApi.saveExercises(id, body);
      return data;
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(workoutsKeys.detail(id).queryKey, data);
      await queryClient.invalidateQueries({ queryKey: workoutsKeys.list._def });
    },
  });
};
