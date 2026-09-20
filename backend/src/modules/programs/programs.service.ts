import { and, eq, asc, desc, isNotNull, count, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { programs, programExercises, exercises, workouts } from '../../db/schema.js';
import type { SaveProgramInput } from './programs.schema.js';

const withExercises = {
  programExercises: {
    orderBy: (pe: any, { asc }: any) => [asc(pe.orderIndex)],
    with: { exercise: true },
  },
} as const;

export async function listPrograms(userId: string) {
  return db.query.programs.findMany({
    where: eq(programs.userId, userId),
    // orderIndex drives rotation order (A, Б, ...); createdAt breaks ties
    // for rows that share the same orderIndex (e.g. pre-rotation backfill).
    orderBy: [asc(programs.orderIndex), asc(programs.createdAt)],
    with: withExercises,
  });
}

// Which program to suggest for the NEXT workout: the one after the last
// actually-used program in the rotation, in a strict cycle. This is only a
// suggestion, not a rule - the user can always pick any other active
// program instead (including the same one twice in a row), and doing so
// does not change how this function computes the following suggestion.
export async function getSuggestedProgram(userId: string) {
  const allPrograms = await listPrograms(userId);
  if (allPrograms.length === 0) return null;

  const lastProgramWorkout = await db.query.workouts.findFirst({
    where: and(eq(workouts.userId, userId), isNotNull(workouts.programId)),
    orderBy: [desc(workouts.date), desc(workouts.createdAt)],
  });

  if (!lastProgramWorkout) return allPrograms[0];

  const lastIndex = allPrograms.findIndex((p) => p.id === lastProgramWorkout.programId);
  if (lastIndex === -1) return allPrograms[0];
  return allPrograms[(lastIndex + 1) % allPrograms.length];
}

export async function getProgram(userId: string, programId: string) {
  return db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.userId, userId)),
    with: withExercises,
  });
}

export async function createProgram(userId: string, input: SaveProgramInput) {
  return db.transaction(async (tx) => {
    const exerciseIds = [...new Set(input.exercises.map((e) => e.exerciseId))];
    const owned = await tx.query.exercises.findMany({ where: eq(exercises.userId, userId) });
    const ownedIds = new Set(owned.map((e) => e.id));
    const missing = exerciseIds.filter((id) => !ownedIds.has(id));
    if (missing.length > 0) {
      throw new Error(`Unknown exercise id(s): ${missing.join(', ')}`);
    }

    // New program goes to the back of the rotation queue.
    const [{ nextOrderIndex }] = await tx
      .select({ nextOrderIndex: sql<number>`coalesce(max(${programs.orderIndex}), -1) + 1` })
      .from(programs)
      .where(eq(programs.userId, userId));

    const [program] = await tx
      .insert(programs)
      .values({ userId, name: input.name, orderIndex: nextOrderIndex })
      .returning();

    await tx.insert(programExercises).values(
      input.exercises.map((ex, i) => ({
        programId: program.id,
        exerciseId: ex.exerciseId,
        targetSets: ex.targetSets,
        orderIndex: i,
      })),
    );

    // Read back via tx, not the module-level `db` - the inserts above
    // aren't committed yet, so a query on a separate connection wouldn't
    // see them (same pitfall as workouts.service.ts's startWorkout).
    return tx.query.programs.findFirst({
      where: eq(programs.id, program.id),
      with: withExercises,
    });
  });
}

export async function updateProgram(userId: string, programId: string, input: SaveProgramInput) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.programs.findFirst({
      where: and(eq(programs.id, programId), eq(programs.userId, userId)),
    });
    if (!existing) return null;

    const exerciseIds = [...new Set(input.exercises.map((e) => e.exerciseId))];
    const owned = await tx.query.exercises.findMany({ where: eq(exercises.userId, userId) });
    const ownedIds = new Set(owned.map((e) => e.id));
    const missing = exerciseIds.filter((id) => !ownedIds.has(id));
    if (missing.length > 0) {
      throw new Error(`Unknown exercise id(s): ${missing.join(', ')}`);
    }

    await tx.update(programs).set({ name: input.name }).where(eq(programs.id, programId));
    await tx.delete(programExercises).where(eq(programExercises.programId, programId));

    await tx.insert(programExercises).values(
      input.exercises.map((ex, i) => ({
        programId,
        exerciseId: ex.exerciseId,
        targetSets: ex.targetSets,
        orderIndex: i,
      })),
    );

    return tx.query.programs.findFirst({
      where: eq(programs.id, programId),
      with: withExercises,
    });
  });
}

export async function deleteProgram(userId: string, programId: string) {
  const existing = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.userId, userId)),
  });
  if (!existing) return false;
  await db.delete(programs).where(eq(programs.id, programId));
  return true;
}
