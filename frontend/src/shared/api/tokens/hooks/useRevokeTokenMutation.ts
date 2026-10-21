import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { TokensApi } from '../tokens.api.js';
import { tokensKeys } from '../tokens.keys.js';

export const useRevokeTokenMutation = (): UseMutationResult<unknown, Error, string> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: tokensKeys.revoke.queryKey,
    mutationFn: async (id) => {
      return TokensApi.revoke(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tokensKeys.list.queryKey });
    },
  });
};
