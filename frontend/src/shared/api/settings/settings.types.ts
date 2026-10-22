export type UserSettings = {
  trainingDays: number[];
  trainingTime: string; // "HH:MM"
  trainingDurationMin: number;
  timezone: string; // IANA
  calendarConnected: boolean;
  calendarConnectedAt: string | null;
};

// PATCH /settings changes only the fields it is given.
export type UpdateSettingsInput = Partial<
  Pick<UserSettings, 'trainingDays' | 'trainingTime' | 'trainingDurationMin' | 'timezone'>
>;

export type ScheduleHistoryEntry = {
  trainingDays: number[];
  effectiveFrom: string;
};
