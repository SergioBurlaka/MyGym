import { createQueryKeys } from '@lukemorales/query-key-factory';

export const progressionKeys = createQueryKeys('progression', {
  list: null,
  history: (exerciseId: string) => [exerciseId],
  volumeByCategory: (weeks: number) => [weeks],
});
