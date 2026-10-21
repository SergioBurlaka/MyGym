import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { OAuthApi } from '../oauth.api.js';
import { oauthKeys } from '../oauth.keys.js';

export const useRevokeGrantMutation = (): UseMutationResult<unknown, Error, string> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: oauthKeys.revokeGrant.queryKey,
    mutationFn: async (id) => OAuthApi.revokeGrant(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: oauthKeys.grants.queryKey });
    },
  });
};
