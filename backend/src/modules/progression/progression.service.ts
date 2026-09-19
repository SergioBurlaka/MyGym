import { and, eq, isNull, asc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { exercises, workoutExercises, workouts, sets } from '../../db/schema.js';

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
  suggestion: ProgressionSuggestion;
  message: string;
};

type HistoryPoint = {
  date: string;
  totalWeightKg: number | null;
  maxReps: number;
  avgReps: number;
  setsCount: number;
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
// improved on the one before it. Falls back to the earliest entry's date
// when no improvement has ever been recorded (nothing to compare against
// yet, but also nothing "stalled").
function findLastProgressDate(history: HistoryPoint[]): string | null {
  if (history.length === 0) return null;
  let lastProgressDate = history[0].date;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const cur = history[i];
    const weightImproved =
      cur.totalWeightKg != null && prev.totalWeightKg != null && cur.totalWeightKg > prev.totalWeightKg;
    const repsImproved = cur.maxReps > prev.maxReps;
    if (weightImproved || repsImproved) {
      lastProgressDate = cur.date;
    }
  }
  return lastProgressDate;
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

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, entry]) => ({
      date,
      totalWeightKg: totalWeight(entry.weightPerUnitKg, entry.weightUnits),
      maxReps: Math.max(...entry.reps),
      avgReps: entry.reps.reduce((a, b) => a + b, 0) / entry.reps.length,
      setsCount: entry.reps.length,
    }));
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

  const now = new Date();
  const results: ExerciseProgression[] = [];

  for (const ex of userExercises) {
    const history = await buildHistory(ex.id);
    const weightStepKg = Number(ex.weightStepKg);

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
        suggestion: 'no_data',
        message: 'Ще немає жодного запису для цієї вправи.',
      });
      continue;
    }

    const last = history[history.length - 1];
    const lastDate = new Date(`${last.date}T00:00:00Z`);
    const daysSinceLastWorkout = daysBetween(lastDate, now);
    const lastProgressDateStr = findLastProgressDate(history);
    const daysSinceProgress = lastProgressDateStr
      ? daysBetween(new Date(`${lastProgressDateStr}T00:00:00Z`), now)
      : null;

    const atTopOfRange = last.maxReps >= ex.repRangeMax;
    const hasWeight = last.totalWeightKg != null && last.totalWeightKg > 0;

    let suggestion: ProgressionSuggestion;
    let message: string;

    if (atTopOfRange && ex.category === 'bodyweight' && !hasWeight) {
      suggestion = 'start_adding_weight';
      message = `Досягнуто ${ex.repRangeMax} повторень без ваги — час почати додавати обтяження.`;
    } else if (atTopOfRange) {
      suggestion = 'increase_weight';
      message = `Досягнуто верхньої межі (${ex.repRangeMax} повт.) — додайте +${weightStepKg} кг з кожного боку.`;
    } else if (daysSinceProgress != null && daysSinceProgress >= PROGRESS_REMINDER_DAYS) {
      suggestion = 'try_more';
      message = `Без прогресу вже ${daysSinceProgress} дн. — спробуйте більше повторень або вагу.`;
    } else {
      suggestion = 'ok';
      message = 'Прогрес у нормі.';
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
      suggestion,
      message,
    });
  }

  return results;
}
