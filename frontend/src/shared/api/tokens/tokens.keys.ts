import { createQueryKeys } from '@lukemorales/query-key-factory';

export const tokensKeys = createQueryKeys('tokens', {
  list: null,
  create: null,
  revoke: null,
});
