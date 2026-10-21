import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { OAuthApi } from '../oauth.api.js';
import { oauthKeys } from '../oauth.keys.js';
import type { OAuthConsentInfo } from '../oauth.types.js';

export const useOAuthRequestQuery = (id: string | null): UseQueryResult<OAuthConsentInfo, Error> =>
  useQuery({
    queryKey: oauthKeys.request(id ?? '').queryKey,
    queryFn: async () => {
      const { data } = await OAuthApi.getRequest(id!);
      return data;
    },
    enabled: Boolean(id),
    // An expired/used request is a definitive 404 - don't retry it.
    retry: false,
  });
