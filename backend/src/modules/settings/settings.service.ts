import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema.js';
import type { UpdateSettingsInput } from './settings.schema.js';

export async function getSettings(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return { trainingDays: user?.trainingDays ?? [1, 3, 5] };
}

export async function updateSettings(userId: string, input: UpdateSettingsInput) {
  const [row] = await db
    .update(users)
    .set({ trainingDays: input.trainingDays })
    .where(eq(users.id, userId))
    .returning({ trainingDays: users.trainingDays });
  return row;
}
