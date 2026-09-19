import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { AuthApi } from '../auth.api.js';
import { authKeys } from '../auth.keys.js';
import type { RefreshResponse } from '../auth.types.js';

export const useRefreshMutation = (): UseMutationResult<RefreshResponse, Error, void> =>
  useMutation({
    mutationKey: authKeys.refresh.queryKey,
    mutationFn: async () => {
      const { data } = await AuthApi.refresh();
      return data;
    },
  });
