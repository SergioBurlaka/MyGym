import { createQueryKeys } from '@lukemorales/query-key-factory';

export const authKeys = createQueryKeys('auth', {
  login: null,
  register: null,
  refresh: null,
  logout: null,
});
