import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { AuthApi } from '../auth.api.js';
import { authKeys } from '../auth.keys.js';
import type { AuthResponse } from '../auth.types.js';

export const useDemoLoginMutation = (): UseMutationResult<AuthResponse, Error, void> =>
  useMutation({
    mutationKey: authKeys.demo.queryKey,
    mutationFn: async () => {
      const { data } = await AuthApi.demo();
      return data;
    },
  });
