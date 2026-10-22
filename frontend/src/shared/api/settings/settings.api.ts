import { api } from '../../../api/client.js';
import type { ScheduleHistoryEntry, UpdateSettingsInput, UserSettings } from './settings.types.js';

export const SettingsApi = {
  async get() {
    return api.get<UserSettings>('/settings');
  },
  async update(input: UpdateSettingsInput) {
    return api.patch<UserSettings>('/settings', input);
  },
  async history() {
    return api.get<ScheduleHistoryEntry[]>('/settings/history');
  },
};
