import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { OAuthApi } from '../oauth.api.js';
import { oauthKeys } from '../oauth.keys.js';
import type { OAuthGrant } from '../oauth.types.js';

export const useGrantsQuery = (): UseQueryResult<OAuthGrant[], Error> =>
  useQuery({
    queryKey: oauthKeys.grants.queryKey,
    queryFn: async () => {
      const { data } = await OAuthApi.listGrants();
      return data;
    },
  });
