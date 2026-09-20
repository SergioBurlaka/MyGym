import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { trainingScheduleHistory, users } from '../../db/schema.js';
import type { UpdateSettingsInput } from './settings.schema.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getSettings(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return { trainingDays: user?.trainingDays ?? [1, 3, 5] };
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
      .set({ trainingDays: input.trainingDays })
      .where(eq(users.id, userId))
      .returning({ trainingDays: users.trainingDays });

    // One row per calendar day the schedule changed - a second edit on the
    // same day overwrites that day's row instead of stacking another one.
    await tx
      .insert(trainingScheduleHistory)
      .values({ userId, trainingDays: input.trainingDays, effectiveFrom: todayIso() })
      .onConflictDoUpdate({
        target: [trainingScheduleHistory.userId, trainingScheduleHistory.effectiveFrom],
        set: { trainingDays: input.trainingDays },
      });

    return row;
  });
}
