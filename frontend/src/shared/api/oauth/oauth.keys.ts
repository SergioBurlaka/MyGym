import { createQueryKeys } from '@lukemorales/query-key-factory';

export const oauthKeys = createQueryKeys('oauth', {
  request: (id: string) => [id],
  decide: null,
  grants: null,
  revokeGrant: null,
});
