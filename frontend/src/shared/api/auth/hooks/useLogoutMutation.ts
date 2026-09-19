import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { AuthApi } from '../auth.api.js';
import { authKeys } from '../auth.keys.js';

export const useLogoutMutation = (): UseMutationResult<unknown, Error, void> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: authKeys.logout.queryKey,
    mutationFn: async () => {
      return AuthApi.logout().catch(() => {});
    },
    onSettled: () => {
      queryClient.removeQueries();
    },
  });
};
