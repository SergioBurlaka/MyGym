import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { OAuthApi } from '../oauth.api.js';
import { oauthKeys } from '../oauth.keys.js';

export const useOAuthDecisionMutation = (
  id: string,
): UseMutationResult<{ redirectTo: string }, Error, boolean> =>
  useMutation({
    mutationKey: oauthKeys.decide.queryKey,
    mutationFn: async (approve) => {
      const { data } = await OAuthApi.decide(id, approve);
      return data;
    },
  });
