import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { TokensApi } from '../tokens.api.js';
import { tokensKeys } from '../tokens.keys.js';
import type { CreatedApiToken } from '../tokens.types.js';

export const useCreateTokenMutation = (): UseMutationResult<CreatedApiToken, Error, string> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: tokensKeys.create.queryKey,
    mutationFn: async (name) => {
      const { data } = await TokensApi.create(name);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tokensKeys.list.queryKey });
    },
  });
};
