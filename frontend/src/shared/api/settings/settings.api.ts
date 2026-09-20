import { api } from '../../../api/client.js';
import type { ScheduleHistoryEntry, UserSettings } from './settings.types.js';

export const SettingsApi = {
  async get() {
    return api.get<UserSettings>('/settings');
  },
  async update(trainingDays: number[]) {
    return api.patch<UserSettings>('/settings', { trainingDays });
  },
  async history() {
    return api.get<ScheduleHistoryEntry[]>('/settings/history');
  },
};
