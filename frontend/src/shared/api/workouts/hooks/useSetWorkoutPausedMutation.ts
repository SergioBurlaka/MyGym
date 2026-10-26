import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { ActiveWorkout, Workout } from '../../../../types/index.js';
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
    onSuccess: (data) => {
      const pause = { pausedMs: data.pausedMs, pausedAt: data.pausedAt };
      queryClient.setQueryData<ActiveWorkout | null>(workoutsKeys.active.queryKey, (old) =>
        old && old.id === data.id ? { ...old, ...pause } : old,
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
