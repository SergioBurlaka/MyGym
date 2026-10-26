import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { ActiveWorkoutState, Workout } from '../../../../types/index.js';
import { WorkoutsApi } from '../workouts.api.js';
import { workoutsKeys } from '../workouts.keys.js';

export const useSetWorkoutPausedMutation = (): UseMutationResult<
  Workout,
  Error,
  { id: string; paused: boolean }
> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: workoutsKeys.setPaused.queryKey,
    mutationFn: async ({ id, paused }) => {
      const { data } = await WorkoutsApi.setPaused(id, paused);
      return data;
    },
    // A poll already in flight would land after onSuccess with the old
    // pause state and set the timer running again until the next poll.
    onMutate: () => queryClient.cancelQueries({ queryKey: workoutsKeys.active.queryKey }),
    onSuccess: (data) => {
      const pause = { pausedMs: data.pausedMs, pausedAt: data.pausedAt };
      queryClient.setQueryData<ActiveWorkoutState>(workoutsKeys.active.queryKey, (old) =>
        old?.workout && old.workout.id === data.id ? { ...old, workout: { ...old.workout, ...pause } } : old,
      );
      // A bare row, like finish - merge, don't drop the cached exercises.
      queryClient.setQueryData<Workout>(workoutsKeys.detail(data.id).queryKey, (old) =>
        old ? { ...old, ...pause } : old,
      );
    },
    // 409 workout_finished: it was closed meanwhile (auto-finish) - refetch
    // so the timer disappears instead of offering a dead button.
    onError: () => queryClient.invalidateQueries({ queryKey: workoutsKeys.active.queryKey }),
  });
};
