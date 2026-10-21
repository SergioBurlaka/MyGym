import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { TokensApi } from '../tokens.api.js';
import { tokensKeys } from '../tokens.keys.js';
import type { CreatedApiToken } from '../tokens.types.js';

export const useCreateTokenMutation = (): UseMutationResult<CreatedApiToken, Error, string> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: tokensKeys.create.queryKey,
    // The result is the raw token: don't keep it in the mutation cache after
    // the page lets go of it.
    gcTime: 0,
    mutationFn: async (name) => {
      const { data } = await TokensApi.create(name);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tokensKeys.list.queryKey });
    },
  });
};
