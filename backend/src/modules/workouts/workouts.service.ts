import { and, eq, desc, lt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { workouts, workoutExercises, sets, exercises } from '../../db/schema.js';
import type { SaveWorkoutExercisesInput } from './workouts.schema.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function startWorkout(userId: string, date?: string) {
  const [workout] = await db
    .insert(workouts)
    .values({
      userId,
      date: date ?? todayIso(),
      timeStart: new Date(),
    })
    .returning();
  return workout;
}

export async function finishWorkout(userId: string, workoutId: string) {
  const existing = await db.query.workouts.findFirst({
    where: and(eq(workouts.id, workoutId), eq(workouts.userId, userId)),
  });
  if (!existing) return null;

  const [row] = await db
    .update(workouts)
    .set({ timeEnd: new Date() })
    .where(eq(workouts.id, workoutId))
    .returning();
  return row;
}

export async function listWorkouts(userId: string, opts: { limit?: number; before?: string } = {}) {
  const limit = opts.limit ?? 30;
  const conditions = [eq(workouts.userId, userId)];
  if (opts.before) {
    conditions.push(lt(workouts.date, opts.before));
  }

  const rows = await db.query.workouts.findMany({
    where: and(...conditions),
    orderBy: [desc(workouts.date), desc(workouts.createdAt)],
    limit,
    with: {
      workoutExercises: {
        with: { exercise: true, sets: true },
      },
    },
  });

  return rows;
}

export async function getWorkout(userId: string, workoutId: string) {
  return db.query.workouts.findFirst({
    where: and(eq(workouts.id, workoutId), eq(workouts.userId, userId)),
    with: {
      workoutExercises: {
        orderBy: (we, { asc }) => [asc(we.orderIndex)],
        with: { exercise: true, sets: { orderBy: (s, { asc }) => [asc(s.setNumber)] } },
      },
    },
  });
}

export async function deleteWorkout(userId: string, workoutId: string) {
  const existing = await db.query.workouts.findFirst({
    where: and(eq(workouts.id, workoutId), eq(workouts.userId, userId)),
  });
  if (!existing) return false;
  await db.delete(workouts).where(eq(workouts.id, workoutId));
  return true;
}

// Replaces the full exercises/sets list for a workout in one transaction.
// The frontend always sends the complete current state of the form, which
// keeps the client<->server contract simple (no incremental PATCH diffing).
export async function saveWorkoutExercises(
  userId: string,
  workoutId: string,
  input: SaveWorkoutExercisesInput,
) {
  return db.transaction(async (tx) => {
    const workout = await tx.query.workouts.findFirst({
      where: and(eq(workouts.id, workoutId), eq(workouts.userId, userId)),
    });
    if (!workout) return null;

    // Make sure every referenced exercise actually belongs to this user.
    const exerciseIds = [...new Set(input.exercises.map((e) => e.exerciseId))];
    if (exerciseIds.length > 0) {
      const owned = await tx.query.exercises.findMany({
        where: and(eq(exercises.userId, userId)),
      });
      const ownedIds = new Set(owned.map((e) => e.id));
      const missing = exerciseIds.filter((id) => !ownedIds.has(id));
      if (missing.length > 0) {
        throw new Error(`Unknown exercise id(s): ${missing.join(', ')}`);
      }
    }

    await tx.delete(workoutExercises).where(eq(workoutExercises.workoutId, workoutId));

    for (let i = 0; i < input.exercises.length; i++) {
      const ex = input.exercises[i];
      const [we] = await tx
        .insert(workoutExercises)
        .values({
          workoutId,
          exerciseId: ex.exerciseId,
          weightPerUnitKg: ex.weightPerUnitKg != null ? String(ex.weightPerUnitKg) : null,
          weightUnits: ex.weightPerUnitKg != null ? (ex.weightUnits ?? 2) : null,
          notes: ex.notes ?? null,
          orderIndex: i,
        })
        .returning();

      await tx.insert(sets).values(
        ex.sets.map((s) => ({
          workoutExerciseId: we.id,
          setNumber: s.setNumber,
          reps: s.reps,
        })),
      );
    }

    return getWorkout(userId, workoutId);
  });
}
