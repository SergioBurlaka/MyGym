import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { HistoryPoint } from '../../../../types/index.js';
import { ProgressionApi } from '../progression.api.js';
import { progressionKeys } from '../progression.keys.js';

export const useProgressionHistoryQuery = (
  exerciseId: string | null,
): UseQueryResult<HistoryPoint[], Error> =>
  useQuery({
    queryKey: progressionKeys.history(exerciseId ?? '').queryKey,
    queryFn: async () => {
      const { data } = await ProgressionApi.history(exerciseId as string);
      return data;
    },
    enabled: !!exerciseId,
  });
