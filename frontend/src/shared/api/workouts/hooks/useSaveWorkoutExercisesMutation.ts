import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Workout } from '../../../../types/index.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';
import type { SaveWorkoutExercisesBody } from '../workouts.types.js';
import { progressionKeys } from '../../progression/progression.keys.js';

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
      // A day becomes a training day with its first set: the consistency calendar
      // and the date picker's dots read the dates list.
      await queryClient.invalidateQueries({ queryKey: workoutsKeys.dates._def });
      // Another workout's progressAt depends on this one - mark every open
      // workout page stale (refetched when next shown), without fetching now.
      await queryClient.invalidateQueries({ queryKey: workoutsKeys.detail._def, refetchType: 'none' });
      // The try-more countdowns on the Programs page come from here.
      await queryClient.invalidateQueries({ queryKey: progressionKeys._def });
    },
  });
};
