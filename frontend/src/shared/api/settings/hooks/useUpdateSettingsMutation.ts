import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { UpdateSettingsInput, UserSettings } from '../settings.types.js';
import { SettingsApi } from '../settings.api.js';
import { settingsKeys } from '../settings.keys.js';

export const useUpdateSettingsMutation = (): UseMutationResult<UserSettings, Error, UpdateSettingsInput> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: settingsKeys.update.queryKey,
    mutationFn: async (input) => {
      const { data } = await SettingsApi.update(input);
      return data;
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(settingsKeys.detail.queryKey, data);
      await queryClient.invalidateQueries({ queryKey: settingsKeys.history.queryKey });
    },
  });
};
