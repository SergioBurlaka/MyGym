import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { UserSettings } from '../settings.types.js';
import { SettingsApi } from '../settings.api.js';
import { settingsKeys } from '../settings.keys.js';

export const useSettingsQuery = (): UseQueryResult<UserSettings, Error> =>
  useQuery({
    queryKey: settingsKeys.detail.queryKey,
    queryFn: async () => {
      const { data } = await SettingsApi.get();
      return data;
    },
  });
