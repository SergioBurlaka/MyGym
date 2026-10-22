import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { trainingScheduleHistory, users } from '../../db/schema.js';
import type { UpdateSettingsInput } from './settings.schema.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const settingsColumns = {
  trainingDays: users.trainingDays,
  trainingTime: users.trainingTime,
  trainingDurationMin: users.trainingDurationMin,
  timezone: users.timezone,
  calendarFeedTokenHash: users.calendarFeedTokenHash,
  calendarFeedCreatedAt: users.calendarFeedCreatedAt,
};

type SettingsRow = {
  trainingDays: number[];
  trainingTime: string;
  trainingDurationMin: number;
  timezone: string;
  calendarFeedTokenHash: string | null;
  calendarFeedCreatedAt: Date | null;
};

// The token hash itself never leaves the backend - the client only needs to
// know whether a calendar is connected.
function toSettings(row: SettingsRow) {
  return {
    trainingDays: row.trainingDays,
    trainingTime: row.trainingTime,
    trainingDurationMin: row.trainingDurationMin,
    timezone: row.timezone,
    calendarConnected: row.calendarFeedTokenHash !== null,
    calendarConnectedAt: row.calendarFeedCreatedAt,
  };
}

export async function getSettings(userId: string) {
  const [row] = await db.select(settingsColumns).from(users).where(eq(users.id, userId));
  return toSettings(row);
}

// Full history of schedule changes, oldest first - lets the consistency
// calendar judge each past date against the schedule that was actually in
// effect on that date, not today's value.
export async function getScheduleHistory(userId: string) {
  return db.query.trainingScheduleHistory.findMany({
    where: eq(trainingScheduleHistory.userId, userId),
    orderBy: [asc(trainingScheduleHistory.effectiveFrom)],
    columns: { trainingDays: true, effectiveFrom: true },
  });
}

export async function updateSettings(userId: string, input: UpdateSettingsInput) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({
        trainingDays: input.trainingDays,
        trainingTime: input.trainingTime,
        trainingDurationMin: input.trainingDurationMin,
        timezone: input.timezone,
      })
      .where(eq(users.id, userId))
      .returning(settingsColumns);

    // History is about days only: changing the time or timezone must not
    // add a row. One row per calendar day the schedule changed - a second
    // edit on the same day overwrites that day's row instead of stacking.
    if (input.trainingDays) {
      await tx
        .insert(trainingScheduleHistory)
        .values({ userId, trainingDays: input.trainingDays, effectiveFrom: todayIso() })
        .onConflictDoUpdate({
          target: [trainingScheduleHistory.userId, trainingScheduleHistory.effectiveFrom],
          set: { trainingDays: input.trainingDays },
        });
    }

    return toSettings(row);
  });
}
