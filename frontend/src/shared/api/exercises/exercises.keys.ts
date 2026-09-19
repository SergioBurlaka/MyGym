import { createQueryKeys } from '@lukemorales/query-key-factory';

export const exercisesKeys = createQueryKeys('exercises', {
  list: null,
  create: null,
  archive: null,
});
