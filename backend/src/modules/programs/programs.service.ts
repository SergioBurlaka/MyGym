import { and, eq, asc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { programs, programExercises, exercises } from '../../db/schema.js';
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
    orderBy: [asc(programs.createdAt)],
    with: withExercises,
  });
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

    const [program] = await tx.insert(programs).values({ userId, name: input.name }).returning();

    await tx.insert(programExercises).values(
      input.exercises.map((ex, i) => ({
        programId: program.id,
        exerciseId: ex.exerciseId,
        weightPerUnitKg: ex.weightPerUnitKg != null ? String(ex.weightPerUnitKg) : null,
        weightUnits: ex.weightPerUnitKg != null ? (ex.weightUnits ?? 2) : null,
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
        weightPerUnitKg: ex.weightPerUnitKg != null ? String(ex.weightPerUnitKg) : null,
        weightUnits: ex.weightPerUnitKg != null ? (ex.weightUnits ?? 2) : null,
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
