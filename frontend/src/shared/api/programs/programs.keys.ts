import { createQueryKeys } from '@lukemorales/query-key-factory';

export const programsKeys = createQueryKeys('programs', {
  list: null,
  detail: (id: string) => [id],
  create: null,
  update: null,
  remove: null,
});
