import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ExerciseProgression } from '../../../../types/index.js';
import { ProgressionApi } from '../progression.api.js';
import { progressionKeys } from '../progression.keys.js';

export const useProgressionQuery = (): UseQueryResult<ExerciseProgression[], Error> =>
  useQuery({
    queryKey: progressionKeys.list.queryKey,
    queryFn: async () => {
      const { data } = await ProgressionApi.list();
      return data;
    },
  });
