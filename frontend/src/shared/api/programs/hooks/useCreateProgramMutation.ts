import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Program } from '../../../../types/index.js';
import { ProgramsApi } from '../programs.api.js';
import { programsKeys } from '../programs.keys.js';
import type { SaveProgramBody } from '../programs.types.js';

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
    },
  });
};
