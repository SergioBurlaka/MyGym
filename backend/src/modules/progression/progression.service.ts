import { and, eq, gte, isNull, asc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { exercises, workoutExercises, workouts, sets, programs, programExercises } from '../../db/schema.js';

const PROGRESS_REMINDER_DAYS = 14;

export type ProgressionSuggestion =
  | 'no_data'
  | 'ok'
  | 'try_more'
  | 'increase_weight'
  | 'start_adding_weight';

export type ExerciseProgression = {
  exerciseId: string;
  name: string;
  category: 'large' | 'small' | 'bodyweight';
  repRangeMin: number;
  repRangeMax: number;
  weightStepKg: number;
  lastWorkoutDate: string | null;
  lastTotalWeightKg: number | null;
  lastMaxReps: number | null;
  daysSinceLastWorkout: number | null;
  daysSinceProgress: number | null;
  // Number of workouts (sessions with this exercise logged) since the last
  // one that showed progress - unlike daysSinceProgress, skipped/missed
  // schedule days simply don't add to this count (see tryMoreAfterWorkouts).
  sessionsSinceProgress: number | null;
  // Set (from the owning Program, the smallest value across programs if the
  // exercise is in more than one) when this exercise uses the workout-count
  // rule instead of the default 14-calendar-day one for the `try_more`
  // suggestion. Null means the day-based rule applies.
  tryMoreAfterWorkouts: number | null;
  suggestion: ProgressionSuggestion;
};

type HistoryPoint = {
  date: string;
  totalWeightKg: number | null;
  maxReps: number;
  avgReps: number;
  setsCount: number;
  // Epley formula (totalWeightKg * (1 + maxReps/30)) - only meaningful when
  // the exercise was done with weight, and unreliable past ~15 reps, but we
  // still compute it (the frontend just needs a trend, not a precise number).
  estimatedOneRepMaxKg: number | null;
  // totalWeightKg * sum(reps) for weighted exercises; null for bodyweight
  // (use totalReps as the "volume" there instead).
  volumeKg: number | null;
  totalReps: number;
  // true when this point's totalWeightKg/maxReps is strictly greater than
  // every earlier point for this exercise (a personal record at the time).
  isWeightPR: boolean;
  isRepsPR: boolean;
};

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function totalWeight(weightPerUnitKg: string | null, weightUnits: number | null): number | null {
  if (weightPerUnitKg == null) return null;
  const units = weightUnits ?? 2;
  return Number(weightPerUnitKg) * units;
}

// Walks a chronological history and returns the date of the most recent
// entry where either the working weight or the max reps for that session
// improved on the one before it, plus how many sessions have happened since
// (0 if the progress was the latest session). Falls back to the earliest
// entry when no improvement has ever been recorded (nothing to compare
// against yet, but also nothing "stalled").
function findLastProgress(history: HistoryPoint[]): { date: string; sessionsSince: number } | null {
  if (history.length === 0) return null;
  let lastProgressIndex = 0;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const cur = history[i];
    const weightImproved =
      cur.totalWeightKg != null && prev.totalWeightKg != null && cur.totalWeightKg > prev.totalWeightKg;
    const repsImproved = cur.maxReps > prev.maxReps;
    if (weightImproved || repsImproved) {
      lastProgressIndex = i;
    }
  }
  return { date: history[lastProgressIndex].date, sessionsSince: history.length - 1 - lastProgressIndex };
}

// Smallest tryMoreAfterWorkouts across all of the user's programs that
// include a given exercise (null if none set it, or the exercise isn't in
// any program) - see programs.tryMoreAfterWorkouts.
async function getTryMoreAfterWorkoutsByExercise(userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ exerciseId: programExercises.exerciseId, tryMoreAfterWorkouts: programs.tryMoreAfterWorkouts })
    .from(programExercises)
    .innerJoin(programs, eq(programExercises.programId, programs.id))
    .where(and(eq(programs.userId, userId), gte(programs.tryMoreAfterWorkouts, 1)));

  const byExercise = new Map<string, number>();
  for (const row of rows) {
    if (row.tryMoreAfterWorkouts == null) continue;
    const current = byExercise.get(row.exerciseId);
    if (current == null || row.tryMoreAfterWorkouts < current) {
      byExercise.set(row.exerciseId, row.tryMoreAfterWorkouts);
    }
  }
  return byExercise;
}

async function buildHistory(exerciseId: string): Promise<HistoryPoint[]> {
  const rows = await db
    .select({
      date: workouts.date,
      weightPerUnitKg: workoutExercises.weightPerUnitKg,
      weightUnits: workoutExercises.weightUnits,
      reps: sets.reps,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .innerJoin(sets, eq(sets.workoutExerciseId, workoutExercises.id))
    .where(eq(workoutExercises.exerciseId, exerciseId))
    .orderBy(asc(workouts.date));

  const byDate = new Map<string, { weightPerUnitKg: string | null; weightUnits: number | null; reps: number[] }>();
  for (const row of rows) {
    const key = row.date;
    if (!byDate.has(key)) {
      byDate.set(key, { weightPerUnitKg: row.weightPerUnitKg, weightUnits: row.weightUnits, reps: [] });
    }
    byDate.get(key)!.reps.push(row.reps);
  }

  const sorted = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  // Running bests, walked chronologically, to flag PRs (task 5) - reset per
  // exercise since buildHistory is called once per exerciseId.
  let bestWeightKg: number | null = null;
  let bestReps: number | null = null;

  return sorted.map(([date, entry]) => {
    const totalWeightKg = totalWeight(entry.weightPerUnitKg, entry.weightUnits);
    const maxReps = Math.max(...entry.reps);
    const totalReps = entry.reps.reduce((a, b) => a + b, 0);
    const avgReps = totalReps / entry.reps.length;

    const estimatedOneRepMaxKg =
      totalWeightKg != null ? Math.round(totalWeightKg * (1 + maxReps / 30) * 10) / 10 : null;
    const volumeKg = totalWeightKg != null ? totalWeightKg * totalReps : null;

    let isWeightPR = false;
    if (totalWeightKg != null && (bestWeightKg == null || totalWeightKg > bestWeightKg)) {
      isWeightPR = true;
      bestWeightKg = totalWeightKg;
    }
    let isRepsPR = false;
    if (bestReps == null || maxReps > bestReps) {
      isRepsPR = true;
      bestReps = maxReps;
    }

    return {
      date,
      totalWeightKg,
      maxReps,
      avgReps,
      setsCount: entry.reps.length,
      estimatedOneRepMaxKg,
      volumeKg,
      totalReps,
      isWeightPR,
      isRepsPR,
    };
  });
}

export async function getExerciseHistory(userId: string, exerciseId: string): Promise<HistoryPoint[]> {
  const exercise = await db.query.exercises.findFirst({
    where: and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)),
  });
  if (!exercise) return [];
  return buildHistory(exerciseId);
}

export async function getProgressionOverview(userId: string): Promise<ExerciseProgression[]> {
  const userExercises = await db.query.exercises.findMany({
    where: and(eq(exercises.userId, userId), isNull(exercises.archivedAt)),
    orderBy: (ex, { asc: ascOrder }) => [ascOrder(ex.name)],
  });

  const tryMoreAfterWorkoutsByExercise = await getTryMoreAfterWorkoutsByExercise(userId);

  const now = new Date();
  const results: ExerciseProgression[] = [];

  for (const ex of userExercises) {
    const history = await buildHistory(ex.id);
    const weightStepKg = Number(ex.weightStepKg);
    const tryMoreAfterWorkouts = tryMoreAfterWorkoutsByExercise.get(ex.id) ?? null;

    if (history.length === 0) {
      results.push({
        exerciseId: ex.id,
        name: ex.name,
        category: ex.category,
        repRangeMin: ex.repRangeMin,
        repRangeMax: ex.repRangeMax,
        weightStepKg,
        lastWorkoutDate: null,
        lastTotalWeightKg: null,
        lastMaxReps: null,
        daysSinceLastWorkout: null,
        daysSinceProgress: null,
        sessionsSinceProgress: null,
        tryMoreAfterWorkouts,
        suggestion: 'no_data',
      });
      continue;
    }

    const last = history[history.length - 1];
    const lastDate = new Date(`${last.date}T00:00:00Z`);
    const daysSinceLastWorkout = daysBetween(lastDate, now);
    const lastProgress = findLastProgress(history);
    const daysSinceProgress = lastProgress
      ? daysBetween(new Date(`${lastProgress.date}T00:00:00Z`), now)
      : null;
    const sessionsSinceProgress = lastProgress?.sessionsSince ?? null;

    const atTopOfRange = last.maxReps >= ex.repRangeMax;
    const hasWeight = last.totalWeightKg != null && last.totalWeightKg > 0;

    const stalled =
      tryMoreAfterWorkouts != null
        ? sessionsSinceProgress != null && sessionsSinceProgress >= tryMoreAfterWorkouts
        : daysSinceProgress != null && daysSinceProgress >= PROGRESS_REMINDER_DAYS;

    let suggestion: ProgressionSuggestion;

    if (atTopOfRange && ex.category === 'bodyweight' && !hasWeight) {
      suggestion = 'start_adding_weight';
    } else if (atTopOfRange) {
      suggestion = 'increase_weight';
    } else if (stalled) {
      suggestion = 'try_more';
    } else {
      suggestion = 'ok';
    }

    results.push({
      exerciseId: ex.id,
      name: ex.name,
      category: ex.category,
      repRangeMin: ex.repRangeMin,
      repRangeMax: ex.repRangeMax,
      weightStepKg,
      lastWorkoutDate: last.date,
      lastTotalWeightKg: last.totalWeightKg,
      lastMaxReps: last.maxReps,
      daysSinceLastWorkout,
      daysSinceProgress,
      sessionsSinceProgress,
      tryMoreAfterWorkouts,
      suggestion,
    });
  }

  return results;
}

export type WeeklyCategoryVolume = {
  weekStart: string;
  large: number;
  small: number;
  bodyweight: number;
};

// Monday (ISO 8601 week start) of the week containing this date.
function isoWeekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// Volume per category per ISO week, for the balance-check chart on the
// Progress page: for weighted exercises, volume = weight * reps per set
// (sums to the same totalWeightKg * totalReps as buildHistory's volumeKg);
// for bodyweight exercises (no weight logged), volume = reps.
export async function getVolumeByCategory(userId: string, weeks: number): Promise<WeeklyCategoryVolume[]> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - weeks * 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rows = await db
    .select({
      date: workouts.date,
      category: exercises.category,
      weightPerUnitKg: workoutExercises.weightPerUnitKg,
      weightUnits: workoutExercises.weightUnits,
      reps: sets.reps,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .innerJoin(sets, eq(sets.workoutExerciseId, workoutExercises.id))
    .where(and(eq(workouts.userId, userId), gte(workouts.date, cutoffStr)));

  const byWeek = new Map<string, WeeklyCategoryVolume>();
  for (const row of rows) {
    const weekStart = isoWeekStart(row.date);
    if (!byWeek.has(weekStart)) {
      byWeek.set(weekStart, { weekStart, large: 0, small: 0, bodyweight: 0 });
    }
    const totals = byWeek.get(weekStart)!;
    const weight = totalWeight(row.weightPerUnitKg, row.weightUnits);
    const contribution = weight != null ? weight * row.reps : row.reps;
    totals[row.category] += contribution;
  }

  return [...byWeek.values()]
    .map((w) => ({
      weekStart: w.weekStart,
      large: Math.round(w.large),
      small: Math.round(w.small),
      bodyweight: Math.round(w.bodyweight),
    }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}
