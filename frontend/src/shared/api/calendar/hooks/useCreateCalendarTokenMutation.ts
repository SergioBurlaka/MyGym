import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { CalendarApi } from '../calendar.api.js';
import { calendarKeys } from '../calendar.keys.js';
import type { CalendarFeedLang, CalendarFeedLinks } from '../calendar.types.js';
import { settingsKeys } from '../../settings/settings.keys.js';

export const useCreateCalendarTokenMutation = (): UseMutationResult<CalendarFeedLinks, Error, CalendarFeedLang> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: calendarKeys.createToken.queryKey,
    // The links carry the secret feed token: don't keep them in the mutation
    // cache after the page lets go of them.
    gcTime: 0,
    mutationFn: async (lang) => {
      const { data } = await CalendarApi.createToken(lang);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsKeys.detail.queryKey });
    },
  });
};
