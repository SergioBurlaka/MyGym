import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { TokensApi } from '../tokens.api.js';
import { tokensKeys } from '../tokens.keys.js';
import type { ApiToken } from '../tokens.types.js';

export const useTokensQuery = (): UseQueryResult<ApiToken[], Error> =>
  useQuery({
    queryKey: tokensKeys.list.queryKey,
    queryFn: async () => {
      const { data } = await TokensApi.list();
      return data;
    },
  });
