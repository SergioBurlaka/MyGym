import { and, eq, desc, count, isNotNull, isNull, gte, lte, asc, inArray, exists, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { workouts, workoutExercises, sets, exercises, programs } from '../../db/schema.js';
import type { SaveWorkoutExercisesInput } from './workouts.schema.js';
import { attachProgressAt } from '../progression/progression.service.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type SourceExercise = { exerciseId: string; weightPerUnitKg: string | null; weightUnits: number | null; orderIndex: number };

type LatestEntry = { weightPerUnitKg: string | null; weightUnits: number | null; reps: number[] };

// The most recent time each exercise was performed in ANY of the user's
// past workouts (not just ones from the same program) - used to prefill a
// new program-started workout with a realistic weight/reps starting point
// instead of blanks or a stale "starting weight" set once in the program.
// Two queries for all exercises: the latest row of each (DISTINCT ON), then
// their sets. An exercise twice in one workout: the one lower in the list.
// Only entries with sets count - one added but never logged (or copied from
// a template, which carries no sets) would prefill every set with 0 reps.
async function findLatestWorkoutExercises(userId: string, exerciseIds: string[]): Promise<Map<string, LatestEntry>> {
  const byExercise = new Map<string, LatestEntry>();
  if (exerciseIds.length === 0) return byExercise;

  const latest = await db
    .selectDistinctOn([workoutExercises.exerciseId], {
      id: workoutExercises.id,
      exerciseId: workoutExercises.exerciseId,
      weightPerUnitKg: workoutExercises.weightPerUnitKg,
      weightUnits: workoutExercises.weightUnits,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(
      and(
        eq(workouts.userId, userId),
        inArray(workoutExercises.exerciseId, exerciseIds),
        exists(db.select({ one: sql`1` }).from(sets).where(eq(sets.workoutExerciseId, workoutExercises.id))),
      ),
    )
    .orderBy(
      workoutExercises.exerciseId,
      desc(workouts.date),
      desc(workouts.createdAt),
      desc(workoutExercises.orderIndex),
      desc(workoutExercises.id),
    );
  if (latest.length === 0) return byExercise;

  const lastSets = await db
    .select({ workoutExerciseId: sets.workoutExerciseId, reps: sets.reps })
    .from(sets)
    .where(inArray(sets.workoutExerciseId, latest.map((we) => we.id)))
    .orderBy(asc(sets.setNumber));

  for (const we of latest) {
    byExercise.set(we.exerciseId, {
      weightPerUnitKg: we.weightPerUnitKg,
      weightUnits: we.weightUnits,
      reps: lastSets.filter((s) => s.workoutExerciseId === we.id).map((s) => s.reps),
    });
  }
  return byExercise;
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
    if (toPrefill.length > 0) {
      const lastEntries = await findLatestWorkoutExercises(userId, toPrefill.map((pe) => pe.exerciseId));

      const inserted = await tx
        .insert(workoutExercises)
        .values(
          toPrefill.map((pe) => ({
            workoutId: workout.id,
            exerciseId: pe.exerciseId,
            weightPerUnitKg: lastEntries.get(pe.exerciseId)?.weightPerUnitKg ?? null,
            weightUnits: lastEntries.get(pe.exerciseId)?.weightUnits ?? null,
            orderIndex: pe.orderIndex,
          })),
        )
        .returning({ id: workoutExercises.id, exerciseId: workoutExercises.exerciseId });
      // An exercise is in a program at most once (program_exercises_program_exercise_idx).
      const insertedId = new Map(inserted.map((we) => [we.exerciseId, we.id]));

      // targetSets rows, reps taken from last time by position - if the
      // program now calls for more sets than last time, the last known rep
      // count repeats as a starting hint (not zero/blank); the user edits
      // by hand regardless.
      await tx.insert(sets).values(
        toPrefill.flatMap((pe) => {
          const lastReps = lastEntries.get(pe.exerciseId)?.reps ?? [];
          return Array.from({ length: pe.targetSets }, (_, i) => ({
            workoutExerciseId: insertedId.get(pe.exerciseId)!,
            setNumber: i + 1,
            reps: lastReps[i] ?? lastReps[lastReps.length - 1] ?? 0,
          }));
        }),
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
  // Already finished (by hand or automatically) - keep its end time; a late
  // "finish" (e.g. from an AI client hours later) would inflate the duration.
  if (existing.timeEnd) return existing;

  // A pause in progress ends with the workout: it goes into pausedMs.
  const now = new Date();
  const [row] = await db
    .update(workouts)
    .set({ timeEnd: now, pausedMs: pausedMsUntil(now), pausedAt: null })
    .where(and(eq(workouts.id, workoutId), isNull(workouts.timeEnd)))
    .returning();
  // Finished by the auto-finish sweep in between - that end time stands.
  return row ?? (await db.query.workouts.findFirst({ where: eq(workouts.id, workoutId) }));
}

// pausedMs plus the pause in progress up to `now` (if paused). In SQL, so a
// concurrent pause/resume can't be lost to a read-modify-write.
function pausedMsUntil(now: Date) {
  return sql`${workouts.pausedMs} + COALESCE(GREATEST(0, ROUND(EXTRACT(EPOCH FROM (${now.toISOString()}::timestamptz - ${workouts.pausedAt})) * 1000))::int, 0)`;
}

// The open workout the header timer counts: the latest started one without
// an end. Normally there is at most one; several (e.g. started via MCP) ->
// the newest.
export async function getActiveWorkout(userId: string) {
  const row = await db.query.workouts.findFirst({
    where: and(eq(workouts.userId, userId), isNull(workouts.timeEnd), isNotNull(workouts.timeStart)),
    orderBy: [desc(workouts.timeStart)],
    columns: { id: true, date: true, programLabel: true, timeStart: true, pausedMs: true, pausedAt: true },
  });
  return row ?? null;
}

// Pause/resume the header timer. Both are idempotent (pausing a paused
// workout returns it as is). null = no such workout of this user,
// 'finished' = it already has an end time (a finished workout's duration
// is settled, as with a late save).
export async function setWorkoutPaused(userId: string, workoutId: string, paused: boolean) {
  const now = new Date();
  const own = and(eq(workouts.id, workoutId), eq(workouts.userId, userId), isNull(workouts.timeEnd));
  const [row] = paused
    ? await db
        .update(workouts)
        .set({ pausedAt: now })
        .where(and(own, isNull(workouts.pausedAt)))
        .returning()
    : await db
        .update(workouts)
        .set({ pausedMs: pausedMsUntil(now), pausedAt: null, resumedAt: now })
        .where(and(own, isNotNull(workouts.pausedAt)))
        .returning();
  if (row) return row;

  const existing = await db.query.workouts.findFirst({
    where: and(eq(workouts.id, workoutId), eq(workouts.userId, userId)),
  });
  if (!existing) return null;
  if (existing.timeEnd) return 'finished' as const;
  return existing;
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
    // Each exercise also gets progressAt - the try-more counter as of that
    // workout - for the journal cards.
    data: await attachProgressAt(userId, rows),
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

// With progressAt on every exercise, as in the journal - the workout page
// shows the same try-more scale.
export async function getWorkout(userId: string, workoutId: string) {
  const workout = await db.query.workouts.findFirst({
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
  if (!workout) return undefined;
  const [withProgress] = await attachProgressAt(userId, [workout]);
  return withProgress;
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
  const saved = await db.transaction(async (tx) => {
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
  return saved ?? null;
}

// progressAt for a just-saved workout, read after the commit (attachProgressAt
// goes through `db`). The workout page puts the save response straight into
// its cache, so without it the try-more scale would vanish on every autosave.
// The sets are already committed by now: a failed read just leaves the
// counter off this response instead of reporting the save as failed.
export async function withProgressAt<W extends Parameters<typeof attachProgressAt>[1][number]>(
  userId: string,
  workout: W,
  onError: (err: unknown) => void,
) {
  try {
    const [withProgress] = await attachProgressAt(userId, [workout]);
    return withProgress;
  } catch (err) {
    onError(err);
    return workout;
  }
}
