import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Exercise } from '../../../../types/index.js';
import { ExercisesApi } from '../exercises.api.js';
import { exercisesKeys } from '../exercises.keys.js';
import type { UpdateExerciseBody } from '../exercises.types.js';
import { progressionKeys } from '../../progression/progression.keys.js';
import { workoutsKeys } from '../../workouts/workouts.keys.js';

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
      // The rep range decides "time to add weight" and the category the
      // default try-more threshold - in the overview and in every workout's
      // progressAt (journal, workout pages).
      await queryClient.invalidateQueries({ queryKey: progressionKeys._def });
      await queryClient.invalidateQueries({ queryKey: workoutsKeys.list._def });
      // Exercise names in the calendar tooltip.
      await queryClient.invalidateQueries({ queryKey: workoutsKeys.dates._def });
      // Workout pages: mark stale (refetched when next shown), no fetch now.
      await queryClient.invalidateQueries({ queryKey: workoutsKeys.detail._def, refetchType: 'none' });
    },
  });
};
