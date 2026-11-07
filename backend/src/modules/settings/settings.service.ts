import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { trainingScheduleHistory, users } from '../../db/schema.js';
import { localDate } from '../progression/progression.service.js';
import type { UpdateSettingsInput } from './settings.schema.js';

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
function toSettings(row: SettingsRow | undefined) {
  // No row: the access token outlived its user.
  if (!row) return null;
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
      // The latest row can be ahead of the local day: registration dates its row
      // in the default zone, and a user west of it is still on the day before. An
      // earlier row would lose to that one for good, so the change takes it over.
      const [latest] = await tx
        .select({ effectiveFrom: trainingScheduleHistory.effectiveFrom })
        .from(trainingScheduleHistory)
        .where(eq(trainingScheduleHistory.userId, userId))
        .orderBy(desc(trainingScheduleHistory.effectiveFrom))
        .limit(1);
      const today = localDate(new Date(), row.timezone);
      const effectiveFrom = latest && latest.effectiveFrom > today ? latest.effectiveFrom : today;
      await tx
        .insert(trainingScheduleHistory)
        .values({ userId, trainingDays: input.trainingDays, effectiveFrom })
        .onConflictDoUpdate({
          target: [trainingScheduleHistory.userId, trainingScheduleHistory.effectiveFrom],
          set: { trainingDays: input.trainingDays },
        });
    }

    return toSettings(row);
  });
}
