import { createQueryKeys } from '@lukemorales/query-key-factory';

export const authKeys = createQueryKeys('auth', {
  login: null,
  register: null,
  demo: null,
  logout: null,
  providers: null,
});
