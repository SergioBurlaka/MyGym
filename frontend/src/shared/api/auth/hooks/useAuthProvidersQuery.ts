import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { AuthApi } from '../auth.api.js';
import { authKeys } from '../auth.keys.js';
import type { AuthProviders } from '../auth.types.js';

export const useAuthProvidersQuery = (): UseQueryResult<AuthProviders, Error> =>
  useQuery({
    queryKey: authKeys.providers.queryKey,
    queryFn: async () => {
      const { data } = await AuthApi.providers();
      return data;
    },
    // Server config - doesn't change while the page is open.
    staleTime: Infinity,
  });
