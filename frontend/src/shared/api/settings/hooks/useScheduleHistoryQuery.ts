import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ScheduleHistoryEntry } from '../settings.types.js';
import { SettingsApi } from '../settings.api.js';
import { settingsKeys } from '../settings.keys.js';

export const useScheduleHistoryQuery = (): UseQueryResult<ScheduleHistoryEntry[], Error> =>
  useQuery({
    queryKey: settingsKeys.history.queryKey,
    queryFn: async () => {
      const { data } = await SettingsApi.history();
      return data;
    },
  });
