import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Program } from '../../../../types/index.js';
import { ProgramsApi } from '../programs.api.js';
import { programsKeys } from '../programs.keys.js';
import type { SaveProgramBody } from '../programs.types.js';
import { progressionKeys } from '../../progression/progression.keys.js';
import { workoutsKeys } from '../../workouts/workouts.keys.js';

export const useCreateProgramMutation = (): UseMutationResult<Program, Error, SaveProgramBody> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: programsKeys.create.queryKey,
    mutationFn: async (body) => {
      const { data } = await ProgramsApi.create(body);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: programsKeys.list.queryKey });
      await queryClient.invalidateQueries({ queryKey: programsKeys.suggestion.queryKey });
      // The try-more countdowns on the Programs page come from here.
      await queryClient.invalidateQueries({ queryKey: progressionKeys.list.queryKey });
      // Journal cards carry progressAt, judged by program thresholds.
      await queryClient.invalidateQueries({ queryKey: workoutsKeys.list._def });
    },
  });
};
