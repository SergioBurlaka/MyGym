import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  exercises,
  programExercises,
  programs,
  sets,
  trainingScheduleHistory,
  users,
  workoutExercises,
  workouts,
} from '../../db/schema.js';
import { env } from '../../config/env.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// How many of the template's latest workouts a new account gets as samples.
export const SAMPLE_WORKOUT_COUNT = 4;

const normalizeName = (name: string) => name.trim().toLowerCase();

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// The account TEMPLATE_ACCOUNT_EMAIL names, or null (unset, no such user, or
// - misconfigured - the demo account itself).
export async function findTemplateUser(executor: Tx | typeof db = db) {
  const email = env.TEMPLATE_ACCOUNT_EMAIL;
  if (!email) return null;
  const [user] = await executor
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = lower(${email})`, eq(users.isDemo, false)))
    .limit(1);
  return user ?? null;
}

// A finished workout, or an old one without times (CSV import). An open one
// (started, no end) is left out - copied, it would tick in someone else's
// header timer.
const finishedWorkout = or(isNotNull(workouts.timeEnd), isNull(workouts.timeStart));

type CopyOptions = {
  // 'all' (the demo: an exact copy, exercise settings included) or the
  // latest N workouts as samples with dates shifted into the past week.
  workouts: 'all' | { latest: number };
};

// Copies the template's programs and workouts (with their exercises and
// sets) into `targetId`, inside the caller's transaction. Exercises are
// matched by name to the target's own; missing ones are created. Ids are
// generated here so every reference (program, exercise) is remapped without
// relying on RETURNING order. Returns the copied workout dates.
export async function copyTemplateData(tx: Tx, sourceId: string, targetId: string, opts: CopyOptions) {
  const exact = opts.workouts === 'all';

  const sourceWorkouts = await tx
    .select()
    .from(workouts)
    .where(and(eq(workouts.userId, sourceId), finishedWorkout))
    .orderBy(desc(workouts.date), desc(workouts.createdAt))
    .limit(exact ? 100_000 : (opts.workouts as { latest: number }).latest);
  const workoutIds = sourceWorkouts.map((w) => w.id);
  const sourceWes = workoutIds.length
    ? await tx.select().from(workoutExercises).where(inArray(workoutExercises.workoutId, workoutIds))
    : [];
  const sourceSets = sourceWes.length
    ? await tx
        .select()
        .from(sets)
        .where(inArray(sets.workoutExerciseId, sourceWes.map((we) => we.id)))
    : [];

  const sourcePrograms = await tx
    .select()
    .from(programs)
    .where(eq(programs.userId, sourceId))
    .orderBy(asc(programs.orderIndex));
  const sourcePes = sourcePrograms.length
    ? await tx
        .select()
        .from(programExercises)
        .where(inArray(programExercises.programId, sourcePrograms.map((p) => p.id)))
    : [];

  // ---- exercises: the template's ones that are needed, mapped to the target's.
  const neededIds = new Set([...sourceWes.map((we) => we.exerciseId), ...sourcePes.map((pe) => pe.exerciseId)]);
  const sourceExercises = await tx
    .select()
    .from(exercises)
    .where(eq(exercises.userId, sourceId));
  const targetExercises = await tx.select().from(exercises).where(eq(exercises.userId, targetId));
  const targetByName = new Map(targetExercises.map((e) => [normalizeName(e.name), e.id]));

  const exerciseMap = new Map<string, string>();
  const newExercises: (typeof exercises.$inferInsert)[] = [];
  for (const ex of sourceExercises) {
    if (!exact && !neededIds.has(ex.id)) continue;
    const existing = targetByName.get(normalizeName(ex.name));
    if (existing) {
      exerciseMap.set(ex.id, existing);
      continue;
    }
    const id = randomUUID();
    exerciseMap.set(ex.id, id);
    newExercises.push({
      id,
      userId: targetId,
      name: ex.name,
      equipment: ex.equipment,
      category: ex.category,
      repRangeMin: ex.repRangeMin,
      repRangeMax: ex.repRangeMax,
      weightStepKg: ex.weightStepKg,
      // The demo mirrors the template; a sample's counter shift isn't the new user's.
      ...(exact
        ? {
            tryMoreCounterAdjust: ex.tryMoreCounterAdjust,
            tryMoreCounterAnchor: ex.tryMoreCounterAnchor,
            archivedAt: ex.archivedAt,
          }
        : {}),
    });
  }
  if (newExercises.length) await tx.insert(exercises).values(newExercises);

  // ---- programs, appended after any the target already has.
  const programMap = new Map<string, string>();
  if (sourcePrograms.length) {
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${programs.orderIndex}) + 1, 0)::int` })
      .from(programs)
      .where(eq(programs.userId, targetId));
    await tx.insert(programs).values(
      sourcePrograms.map((p, i) => {
        const id = randomUUID();
        programMap.set(p.id, id);
        return {
          id,
          userId: targetId,
          name: p.name,
          orderIndex: next + i,
          tryMoreAfterWorkouts: p.tryMoreAfterWorkouts,
        };
      }),
    );
    if (sourcePes.length) {
      await tx.insert(programExercises).values(
        sourcePes.map((pe) => ({
          programId: programMap.get(pe.programId)!,
          exerciseId: exerciseMap.get(pe.exerciseId)!,
          targetSets: pe.targetSets,
          tryMoreAfterWorkouts: pe.tryMoreAfterWorkouts,
          orderIndex: pe.orderIndex,
        })),
      );
    }
  }

  // ---- workouts. Samples move by whole weeks (weekdays, and so the
  // consistency calendar's planned/missed days, stay as they were) so the
  // latest lands within the past week.
  let shiftDays = 0;
  if (!exact && sourceWorkouts.length) {
    const today = new Date().toISOString().slice(0, 10);
    const sinceLatest = Math.round((Date.parse(today) - Date.parse(sourceWorkouts[0].date)) / DAY_MS);
    shiftDays = 7 * Math.floor((sinceLatest - 1) / 7);
  }
  const shiftTime = (t: Date | null) => (t ? new Date(t.getTime() + shiftDays * DAY_MS) : null);

  const workoutMap = new Map<string, string>();
  const newWorkouts = sourceWorkouts.map((w) => {
    const id = randomUUID();
    workoutMap.set(w.id, id);
    return {
      id,
      userId: targetId,
      date: addDays(w.date, shiftDays),
      timeStart: shiftTime(w.timeStart),
      timeEnd: shiftTime(w.timeEnd),
      autoFinished: w.autoFinished,
      pausedMs: w.pausedMs,
      programLabel: w.programLabel,
      programId: w.programId ? (programMap.get(w.programId) ?? null) : null,
      isSample: !exact,
      createdAt: shiftTime(w.createdAt)!,
    };
  });
  const weMap = new Map<string, string>();
  const newWes = sourceWes.map((we) => {
    const id = randomUUID();
    weMap.set(we.id, id);
    return {
      id,
      workoutId: workoutMap.get(we.workoutId)!,
      exerciseId: exerciseMap.get(we.exerciseId)!,
      weightPerUnitKg: we.weightPerUnitKg,
      weightUnits: we.weightUnits,
      orderIndex: we.orderIndex,
      notes: we.notes,
      createdAt: shiftTime(we.createdAt)!,
    };
  });
  const newSets = sourceSets.map((s) => ({
    workoutExerciseId: weMap.get(s.workoutExerciseId)!,
    setNumber: s.setNumber,
    reps: s.reps,
    createdAt: shiftTime(s.createdAt)!,
  }));
  // Chunked: one INSERT has a 65535-parameter limit, and the demo copies
  // the whole history.
  for (const [table, rows] of [
    [workouts, newWorkouts],
    [workoutExercises, newWes],
    [sets, newSets],
  ] as const) {
    for (let i = 0; i < rows.length; i += 1000) {
      await tx.insert(table).values(rows.slice(i, i + 1000) as never);
    }
  }

  return newWorkouts.map((w) => w.date);
}

// A new account's starter data: the template's programs and latest workouts
// as samples. The schedule history is moved back to the first sample, so the
// consistency calendar judges those days too (planned and missed ones).
// No template configured -> nothing happens.
export async function seedStarterData(tx: Tx, userId: string) {
  const template = await findTemplateUser(tx);
  if (!template || template.id === userId) return;
  const dates = await copyTemplateData(tx, template.id, userId, { workouts: { latest: SAMPLE_WORKOUT_COUNT } });
  if (dates.length === 0) return;
  const earliest = dates.reduce((a, b) => (a < b ? a : b));
  await tx
    .update(trainingScheduleHistory)
    .set({ effectiveFrom: earliest })
    .where(and(eq(trainingScheduleHistory.userId, userId), sql`${trainingScheduleHistory.effectiveFrom} > ${earliest}`));
}

// "Remove samples": deletes them, and moves the schedule history back to
// where it would have started without them - the registration day, or the
// user's own earliest workout if older (CSV import) - so the calendar
// doesn't show missed days from before the account existed.
export async function removeSampleWorkouts(userId: string) {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(workouts)
      .where(and(eq(workouts.userId, userId), eq(workouts.isSample, true)))
      .returning({ id: workouts.id });
    if (removed.length === 0) return 0;

    const [user] = await tx.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId));
    const [{ firstWorkout }] = await tx
      .select({ firstWorkout: sql<string | null>`min(${workouts.date})::text` })
      .from(workouts)
      .where(eq(workouts.userId, userId));
    const registered = user.createdAt.toISOString().slice(0, 10);
    const startFrom = firstWorkout && firstWorkout < registered ? firstWorkout : registered;

    const history = await tx
      .select()
      .from(trainingScheduleHistory)
      .where(eq(trainingScheduleHistory.userId, userId))
      .orderBy(asc(trainingScheduleHistory.effectiveFrom));
    const first = history[0];
    if (first && first.effectiveFrom < startFrom) {
      // A later row already on that day (schedule changed on it) takes over.
      if (history.some((h) => h.effectiveFrom === startFrom)) {
        await tx.delete(trainingScheduleHistory).where(eq(trainingScheduleHistory.id, first.id));
      } else {
        await tx
          .update(trainingScheduleHistory)
          .set({ effectiveFrom: startFrom })
          .where(eq(trainingScheduleHistory.id, first.id));
      }
    }
    return removed.length;
  });
}
