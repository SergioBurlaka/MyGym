import { api } from '../../../api/client.js';
import type { CalendarFeedLang, CalendarFeedLinks } from './calendar.types.js';

export const CalendarApi = {
  async createToken(lang: CalendarFeedLang) {
    return api.post<CalendarFeedLinks>('/calendar/token', { lang });
  },
  async deleteToken() {
    return api.delete('/calendar/token');
  },
};
