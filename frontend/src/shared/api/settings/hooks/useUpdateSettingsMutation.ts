import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { UserSettings } from '../settings.types.js';
import { SettingsApi } from '../settings.api.js';
import { settingsKeys } from '../settings.keys.js';

export const useUpdateSettingsMutation = (): UseMutationResult<UserSettings, Error, number[]> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: settingsKeys.update.queryKey,
    mutationFn: async (trainingDays) => {
      const { data } = await SettingsApi.update(trainingDays);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.detail.queryKey, data);
    },
  });
};
