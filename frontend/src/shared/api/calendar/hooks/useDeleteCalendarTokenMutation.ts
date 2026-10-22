import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { CalendarApi } from '../calendar.api.js';
import { calendarKeys } from '../calendar.keys.js';
import { settingsKeys } from '../../settings/settings.keys.js';

export const useDeleteCalendarTokenMutation = (): UseMutationResult<unknown, Error, void> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: calendarKeys.deleteToken.queryKey,
    mutationFn: async () => {
      return CalendarApi.deleteToken();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsKeys.detail.queryKey });
    },
  });
};
