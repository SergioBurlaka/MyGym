import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { WeeklyCategoryVolume } from '../../../../types/index.js';
import { ProgressionApi } from '../progression.api.js';
import { progressionKeys } from '../progression.keys.js';

export const useVolumeByCategoryQuery = (weeks = 12): UseQueryResult<WeeklyCategoryVolume[], Error> =>
  useQuery({
    queryKey: progressionKeys.volumeByCategory(weeks).queryKey,
    queryFn: async () => {
      const { data } = await ProgressionApi.volumeByCategory(weeks);
      return data;
    },
  });
