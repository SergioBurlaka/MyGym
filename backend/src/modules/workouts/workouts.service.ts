import { and, eq, desc, count, isNotNull, gte, lte, asc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { workouts, workoutExercises, sets, exercises, programs } from '../../db/schema.js';
import type { SaveWorkoutExercisesInput } from './workouts.schema.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type SourceExercise = { exerciseId: string; weightPerUnitKg: string | null; weightUnits: number | null; orderIndex: number };

// The most recent time this exercise was performed in ANY of the user's
// past workouts (not just ones from the same program) - used to prefill a
// new program-started workout with a realistic weight/reps starting point
// instead of blanks or a stale "starting weight" set once in the program.
async function findLatestWorkoutExercise(userId: string, exerciseId: string) {
  const rows = await db
    .select({
      id: workoutExercises.id,
      weightPerUnitKg: workoutExercises.weightPerUnitKg,
      weightUnits: workoutExercises.weightUnits,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(eq(workouts.userId, userId), eq(workoutExercises.exerciseId, exerciseId)))
    .orderBy(desc(workouts.date), desc(workouts.createdAt))
    .limit(1);

  const latest = rows[0];
  if (!latest) return null;

  const lastSets = await db.query.sets.findMany({
    where: eq(sets.workoutExerciseId, latest.id),
    orderBy: [asc(sets.setNumber)],
  });

  return { weightPerUnitKg: latest.weightPerUnitKg, weightUnits: latest.weightUnits, sets: lastSets };
}

export async function startWorkout(
  userId: string,
  opts: { date?: string; programLabel?: string | null; copyFromWorkoutId?: string; programId?: string } = {},
) {
  return db.transaction(async (tx) => {
    let programLabel = opts.programLabel ?? null;
    let programId: string | null = null;
    let toCopy: SourceExercise[] = [];
    let toPrefill: { exerciseId: string; targetSets: number; orderIndex: number }[] = [];

    if (opts.programId) {
      // Explicitly authored Program - takes precedence, and its name becomes
      // the workout's label regardless of what programLabel was passed.
      const program = await tx.query.programs.findFirst({
        where: and(eq(programs.id, opts.programId), eq(programs.userId, userId)),
        with: { programExercises: { orderBy: (pe, { asc }) => [asc(pe.orderIndex)] } },
      });
      if (program) {
        programLabel = program.name;
        programId = program.id;
        toPrefill = program.programExercises;
      }
    } else if (opts.copyFromWorkoutId) {
      // Only copy from a workout that actually belongs to this user; a
      // foreign/unknown id is silently ignored rather than failing the
      // whole "start workout" action.
      const source = await tx.query.workouts.findFirst({
        where: and(eq(workouts.id, opts.copyFromWorkoutId), eq(workouts.userId, userId)),
        with: { workoutExercises: { orderBy: (we, { asc }) => [asc(we.orderIndex)] } },
      });
      if (source) toCopy = source.workoutExercises;
    }

    const [workout] = await tx
      .insert(workouts)
      .values({
        userId,
        date: opts.date ?? todayIso(),
        timeStart: new Date(),
        programLabel,
        programId,
      })
      .returning();

    if (toCopy.length > 0) {
      // No sets are copied - reps are filled in fresh each session, only
      // the exercise list and working weight carry over as a starting point.
      await tx.insert(workoutExercises).values(
        toCopy.map((ex) => ({
          workoutId: workout.id,
          exerciseId: ex.exerciseId,
          weightPerUnitKg: ex.weightPerUnitKg,
          weightUnits: ex.weightUnits,
          orderIndex: ex.orderIndex,
        })),
      );
    }

    // Prefill from a Program: weight + reps come from the last time each
    // exercise was actually done (not stored on the program), one row of
    // sets per exercise sized to its targetSets. Read history via `db`
    // (not `tx`) - it's already-committed past data, not the row we're
    // inserting in this same transaction.
    for (const pe of toPrefill) {
      const lastEntry = await findLatestWorkoutExercise(userId, pe.exerciseId);
      const weightPerUnitKg = lastEntry?.weightPerUnitKg ?? null;
      const weightUnits = lastEntry?.weightUnits ?? null;
      const lastReps = lastEntry?.sets.map((s) => s.reps) ?? [];

      const [we] = await tx
        .insert(workoutExercises)
        .values({
          workoutId: workout.id,
          exerciseId: pe.exerciseId,
          weightPerUnitKg,
          weightUnits,
          orderIndex: pe.orderIndex,
        })
        .returning();

      // targetSets rows, reps taken from last time by position - if the
      // program now calls for more sets than last time, the last known rep
      // count repeats as a starting hint (not zero/blank); the user edits
      // by hand regardless.
      await tx.insert(sets).values(
        Array.from({ length: pe.targetSets }, (_, i) => ({
          workoutExerciseId: we.id,
          setNumber: i + 1,
          reps: lastReps[i] ?? lastReps[lastReps.length - 1] ?? 0,
        })),
      );
    }

    // Read back via tx (not the module-level `db`/getWorkout) - the insert
    // above isn't committed yet, so a query on a separate connection
    // wouldn't see it.
    return tx.query.workouts.findFirst({
      where: and(eq(workouts.id, workout.id), eq(workouts.userId, userId)),
      with: {
        workoutExercises: {
          orderBy: (we, { asc }) => [asc(we.orderIndex)],
          with: { exercise: true, sets: { orderBy: (s, { asc }) => [asc(s.setNumber)] } },
        },
      },
    });
  });
}

export async function updateWorkout(
  userId: string,
  workoutId: string,
  patch: { programLabel?: string | null; date?: string },
) {
  const existing = await db.query.workouts.findFirst({
    where: and(eq(workouts.id, workoutId), eq(workouts.userId, userId)),
  });
  if (!existing) return null;

  const updates: Partial<typeof workouts.$inferInsert> = {};
  if (patch.programLabel !== undefined) updates.programLabel = patch.programLabel;
  if (patch.date !== undefined) updates.date = patch.date;

  const [row] = await db
    .update(workouts)
    .set(updates)
    .where(eq(workouts.id, workoutId))
    .returning();
  return row;
}

// One entry per distinct label the user has ever used, pointing at the most
// recent workout with that label - lets "start a new workout" offer
// "start from <label>" with a preview of what it'll copy.
export async function listWorkoutTemplates(userId: string) {
  const labeled = await db.query.workouts.findMany({
    where: and(eq(workouts.userId, userId), isNotNull(workouts.programLabel)),
    orderBy: [desc(workouts.date), desc(workouts.createdAt)],
    with: {
      workoutExercises: {
        orderBy: (we, { asc }) => [asc(we.orderIndex)],
        with: { exercise: true },
      },
    },
  });

  const latestByLabel = new Map<string, (typeof labeled)[number]>();
  for (const w of labeled) {
    const label = w.programLabel as string;
    if (!latestByLabel.has(label)) latestByLabel.set(label, w);
  }

  return [...latestByLabel.values()].map((w) => ({
    label: w.programLabel as string,
    workoutId: w.id,
    date: w.date,
    exerciseNames: w.workoutExercises.map((we) => we.exercise.name),
  }));
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

export async function listWorkouts(userId: string, opts: { page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, Number.isFinite(opts.page) ? (opts.page as number) : 1);
  const pageSize = Math.max(1, Number.isFinite(opts.pageSize) ? (opts.pageSize as number) : 20);
  const offset = (page - 1) * pageSize;
  const where = eq(workouts.userId, userId);

  const [rows, [{ total }]] = await Promise.all([
    db.query.workouts.findMany({
      where,
      orderBy: [desc(workouts.date), desc(workouts.createdAt)],
      limit: pageSize,
      offset,
      with: {
        workoutExercises: {
          with: { exercise: true, sets: true },
        },
      },
    }),
    db.select({ total: count() }).from(workouts).where(where),
  ]);

  return {
    data: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// Lightweight summary for the consistency calendar - just dates + exercise
// names for the tooltip, not the full workout payload listWorkouts returns.
export async function listWorkoutDates(userId: string, from: string, to: string) {
  const rows = await db.query.workouts.findMany({
    where: and(eq(workouts.userId, userId), gte(workouts.date, from), lte(workouts.date, to)),
    orderBy: [desc(workouts.date)],
    with: {
      workoutExercises: {
        orderBy: (we, { asc }) => [asc(we.orderIndex)],
        with: { exercise: true },
      },
    },
  });

  return rows.map((w) => ({
    date: w.date,
    programLabel: w.programLabel,
    exerciseNames: w.workoutExercises.map((we) => we.exercise.name),
  }));
}

export async function getWorkout(userId: string, workoutId: string) {
  return db.query.workouts.findFirst({
    where: and(eq(workouts.id, workoutId), eq(workouts.userId, userId)),
    with: {
      workoutExercises: {
        orderBy: (we, { asc }) => [asc(we.orderIndex)],
        with: { exercise: true, sets: { orderBy: (s, { asc }) => [asc(s.setNumber)] } },
      },
      // Only present while the Program still exists - deleting a Program
      // sets workouts.programId to null, so this naturally disappears
      // without needing to touch the workout's own programLabel text.
      program: true,
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

    // Read back via tx (not the module-level `db`/getWorkout) - the writes
    // above aren't committed yet, so a query on a separate connection would
    // see the pre-save state (same gotcha as startWorkout above).
    return tx.query.workouts.findFirst({
      where: and(eq(workouts.id, workoutId), eq(workouts.userId, userId)),
      with: {
        workoutExercises: {
          orderBy: (we, { asc }) => [asc(we.orderIndex)],
          with: { exercise: true, sets: { orderBy: (s, { asc }) => [asc(s.setNumber)] } },
        },
        program: true,
      },
    });
  });
}
