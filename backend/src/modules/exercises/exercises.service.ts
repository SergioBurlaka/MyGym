import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { exercises } from '../../db/schema.js';
import type { CreateExerciseInput, UpdateExerciseInput } from './exercises.schema.js';

export function listExercises(userId: string) {
  return db.query.exercises.findMany({
    where: and(eq(exercises.userId, userId), isNull(exercises.archivedAt)),
    orderBy: (ex, { asc }) => [asc(ex.name)],
  });
}

export async function createExercise(userId: string, input: CreateExerciseInput) {
  const [row] = await db
    .insert(exercises)
    .values({
      userId,
      name: input.name,
      equipment: input.equipment,
      category: input.category,
      repRangeMin: input.repRangeMin,
      repRangeMax: input.repRangeMax,
      weightStepKg: String(input.weightStepKg),
    })
    .returning();
  return row;
}

export async function updateExercise(userId: string, exerciseId: string, input: UpdateExerciseInput) {
  const existing = await db.query.exercises.findFirst({
    where: and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)),
  });
  if (!existing) return null;

  const [row] = await db
    .update(exercises)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.equipment !== undefined ? { equipment: input.equipment } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.repRangeMin !== undefined ? { repRangeMin: input.repRangeMin } : {}),
      ...(input.repRangeMax !== undefined ? { repRangeMax: input.repRangeMax } : {}),
      ...(input.weightStepKg !== undefined ? { weightStepKg: String(input.weightStepKg) } : {}),
    })
    .where(eq(exercises.id, exerciseId))
    .returning();
  return row;
}

export async function archiveExercise(userId: string, exerciseId: string) {
  const existing = await db.query.exercises.findFirst({
    where: and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)),
  });
  if (!existing) return null;

  const [row] = await db
    .update(exercises)
    .set({ archivedAt: new Date() })
    .where(eq(exercises.id, exerciseId))
    .returning();
  return row;
}
