import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { ProgramsApi } from '../programs.api.js';
import { programsKeys } from '../programs.keys.js';

export const useDeleteProgramMutation = (id: string): UseMutationResult<unknown, Error, void> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: programsKeys.remove.queryKey,
    mutationFn: async () => {
      return ProgramsApi.remove(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: programsKeys.list.queryKey });
      await queryClient.invalidateQueries({ queryKey: programsKeys.suggestion.queryKey });
    },
  });
};
