import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { AuthApi } from '../auth.api.js';
import { authKeys } from '../auth.keys.js';
import type { AuthCredentials, AuthResponse } from '../auth.types.js';

export const useLoginMutation = (): UseMutationResult<AuthResponse, Error, AuthCredentials> =>
  useMutation({
    mutationKey: authKeys.login.queryKey,
    mutationFn: async (payload) => {
      const { data } = await AuthApi.login(payload);
      return data;
    },
  });
