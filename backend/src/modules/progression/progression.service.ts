import { and, eq, gte, inArray, isNull, asc } from 'drizzle-orm';
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
  // Set (from the owning Program - the exercise's own value there, else the
  // program's; the smallest across programs if the exercise is in more than one) when this exercise uses the workout-count
  // rule instead of the default 14-calendar-day one for the `try_more`
  // suggestion. Null means the day-based rule applies.
  tryMoreAfterWorkouts: number | null;
  suggestion: ProgressionSuggestion;
};

export type HistoryPoint = {
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

// Weight of a session, with "no weight logged" and a logged 0 both as 0.
function sessionWeight(point: HistoryPoint): number {
  return point.totalWeightKg ?? 0;
}

// Session "volume" used to detect progress: weight * total reps of all
// sets, or just total reps when the exercise was done without weight (or
// with 0 - otherwise 0 * reps would never grow). More sets, more reps or
// more weight all raise it.
function sessionVolume(point: HistoryPoint): number {
  return sessionWeight(point) > 0 ? sessionWeight(point) * point.totalReps : point.totalReps;
}

// Walks a chronological history and returns the date of the most recent
// entry that progressed on the one before it - a bigger session volume, or
// a heavier working weight (heavier weight often means fewer reps, so the
// volume alone could even drop; going from no weight to some counts too).
// Volumes are only compared between two weighted or two unweighted sessions:
// kg * reps vs plain reps would be meaningless. Returns that date plus how
// many sessions have happened since
// (0 if the progress was the latest session). Falls back to the earliest
// entry when no improvement has ever been recorded (nothing to compare
// against yet, but also nothing "stalled").
export function findLastProgress(history: HistoryPoint[]): { date: string; sessionsSince: number } | null {
  if (history.length === 0) return null;
  let lastProgressIndex = 0;
  for (let i = 1; i < history.length; i++) {
    if (isProgressStep(history[i - 1], history[i])) {
      lastProgressIndex = i;
    }
  }
  return { date: history[lastProgressIndex].date, sessionsSince: history.length - 1 - lastProgressIndex };
}

function isProgressStep(prev: HistoryPoint, cur: HistoryPoint): boolean {
  const weightImproved = sessionWeight(cur) > sessionWeight(prev);
  const sameKind = sessionWeight(cur) > 0 === sessionWeight(prev) > 0;
  const volumeImproved = sameKind && sessionVolume(cur) > sessionVolume(prev);
  return weightImproved || volumeImproved;
}

export type TimelinePoint = {
  date: string;
  // The exercise's first session - nothing to compare against.
  isFirst: boolean;
  isProgress: boolean;
  atTopOfRange: boolean;
  // As of this session (0 when it progressed), same meaning as in
  // ExerciseProgression but frozen at that date.
  sessionsSinceProgress: number;
  daysSinceProgress: number;
};

// Where the progress counter stood after each session of a chronological
// history - the journal shows it per workout. Uses the same progress step
// as findLastProgress, so the last point agrees with it.
export function progressTimeline(history: HistoryPoint[], repRangeMax: number): TimelinePoint[] {
  let lastProgressIndex = 0;
  return history.map((cur, i) => {
    const isProgress = i > 0 && isProgressStep(history[i - 1], cur);
    if (isProgress) lastProgressIndex = i;
    return {
      date: cur.date,
      isFirst: i === 0,
      isProgress,
      atTopOfRange: cur.maxReps >= repRangeMax,
      sessionsSinceProgress: i - lastProgressIndex,
      daysSinceProgress: daysBetween(
        new Date(`${history[lastProgressIndex].date}T00:00:00Z`),
        new Date(`${cur.date}T00:00:00Z`),
      ),
    };
  });
}

// Smallest effective tryMoreAfterWorkouts across all of the user's programs
// that include a given exercise - the exercise's own value in that program
// (programExercises.tryMoreAfterWorkouts), else the program's. Exercises in
// no program, or with neither value set, are absent (14-day rule applies).
async function getTryMoreAfterWorkoutsByExercise(userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      exerciseId: programExercises.exerciseId,
      exerciseValue: programExercises.tryMoreAfterWorkouts,
      programValue: programs.tryMoreAfterWorkouts,
    })
    .from(programExercises)
    .innerJoin(programs, eq(programExercises.programId, programs.id))
    .where(eq(programs.userId, userId));

  const byExercise = new Map<string, number>();
  for (const row of rows) {
    const value = row.exerciseValue ?? row.programValue;
    if (value == null || value < 1) continue;
    const current = byExercise.get(row.exerciseId);
    if (current == null || value < current) {
      byExercise.set(row.exerciseId, value);
    }
  }
  return byExercise;
}

// Deterministic row order for history queries: buildHistoryPoints takes a
// day's weight from its first row, so two workouts on one date must come in
// the same order for the overview and the journal.
const HISTORY_ORDER = [asc(workouts.date), asc(workouts.createdAt), asc(workoutExercises.id)] as const;

// `executor` lets a caller inside a transaction read through it (`tx`)
// instead of taking a second pool connection.
type Executor = Pick<typeof db, 'select'>;

async function buildHistory(exerciseId: string, executor: Executor = db): Promise<HistoryPoint[]> {
  const rows = await executor
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
    .orderBy(...HISTORY_ORDER);

  return buildHistoryPoints(rows);
}

export type HistoryRow = {
  date: string;
  weightPerUnitKg: string | null;
  weightUnits: number | null;
  reps: number;
};

// Pure part of buildHistory: one row per logged set in, one point per
// workout date out (chronological). Kept DB-free so it can be unit-tested.
export function buildHistoryPoints(rows: HistoryRow[]): HistoryPoint[] {
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

export type WorkoutProgressAt = TimelinePoint & {
  // Workout-count threshold to judge this session against (the workout's
  // program, else the smallest across programs); null = 14-day rule.
  tryMoreAfterWorkouts: number | null;
};

type JournalWorkout = {
  date: string;
  programId: string | null;
  workoutExercises: {
    exerciseId: string;
    exercise: { repRangeMax: number; tryMoreCounterAdjust: number; tryMoreCounterAnchor: string | null };
  }[];
};

// Adds `progressAt` - where the progress counter stood after that workout -
// to every exercise of a page of journal workouts. One history query for
// all exercises on the page. The manual counter shift (try-more slider) only
// applies to an exercise's latest session, so the newest card agrees with
// the Programs page while older cards show plain history.
export async function attachProgressAt<W extends JournalWorkout>(userId: string, rows: W[]) {
  const exerciseIds = [...new Set(rows.flatMap((w) => w.workoutExercises.map((we) => we.exerciseId)))];
  const programIds = [...new Set(rows.map((w) => w.programId).filter((id): id is string => id != null))];
  if (exerciseIds.length === 0) {
    return rows.map((w) => ({ ...w, workoutExercises: w.workoutExercises.map((we) => ({ ...we, progressAt: null })) }));
  }

  const [historyRows, peRows, smallestThresholds] = await Promise.all([
    db
      .select({
        exerciseId: workoutExercises.exerciseId,
        date: workouts.date,
        weightPerUnitKg: workoutExercises.weightPerUnitKg,
        weightUnits: workoutExercises.weightUnits,
        reps: sets.reps,
      })
      .from(workoutExercises)
      .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
      .innerJoin(sets, eq(sets.workoutExerciseId, workoutExercises.id))
      .where(and(eq(workouts.userId, userId), inArray(workoutExercises.exerciseId, exerciseIds)))
      .orderBy(...HISTORY_ORDER),
    programIds.length > 0
      ? db
          .select({
            programId: programExercises.programId,
            exerciseId: programExercises.exerciseId,
            exerciseValue: programExercises.tryMoreAfterWorkouts,
            programValue: programs.tryMoreAfterWorkouts,
          })
          .from(programExercises)
          .innerJoin(programs, eq(programExercises.programId, programs.id))
          .where(and(eq(programs.userId, userId), inArray(programExercises.programId, programIds)))
      : Promise.resolve([]),
    getTryMoreAfterWorkoutsByExercise(userId),
  ]);

  const rowsByExercise = new Map<string, HistoryRow[]>();
  for (const row of historyRows) {
    if (!rowsByExercise.has(row.exerciseId)) rowsByExercise.set(row.exerciseId, []);
    rowsByExercise.get(row.exerciseId)!.push(row);
  }
  const programThresholds = new Map<string, number | null>();
  for (const r of peRows) programThresholds.set(`${r.programId}:${r.exerciseId}`, r.exerciseValue ?? r.programValue);

  const timelines = new Map<string, Map<string, TimelinePoint>>();
  function timelineOf(we: JournalWorkout['workoutExercises'][number]) {
    let byDate = timelines.get(we.exerciseId);
    if (!byDate) {
      const history = buildHistoryPoints(rowsByExercise.get(we.exerciseId) ?? []);
      const points = progressTimeline(history, we.exercise.repRangeMax);
      const lastProgress = findLastProgress(history);
      if (lastProgress && points.length > 0) {
        const last = points[points.length - 1];
        const shifted = applyCounterShift(lastProgress, {
          adjust: we.exercise.tryMoreCounterAdjust,
          anchor: we.exercise.tryMoreCounterAnchor,
        });
        // Slider moved off a progress/first session: show the count, as the
        // Programs page does, not "progress".
        if (shifted !== last.sessionsSinceProgress && shifted > 0) {
          last.isProgress = false;
          last.isFirst = false;
        }
        last.sessionsSinceProgress = shifted;
      }
      byDate = new Map(points.map((p) => [p.date, p]));
      timelines.set(we.exerciseId, byDate);
    }
    return byDate;
  }

  return rows.map((w) => ({
    ...w,
    workoutExercises: w.workoutExercises.map((we) => {
      const point = timelineOf(we).get(w.date);
      const fromProgram = w.programId != null ? programThresholds.get(`${w.programId}:${we.exerciseId}`) : null;
      const progressAt: WorkoutProgressAt | null = point
        ? { ...point, tryMoreAfterWorkouts: fromProgram ?? smallestThresholds.get(we.exerciseId) ?? null }
        : null;
      return { ...we, progressAt };
    }),
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
    const { daysSinceLastWorkout, daysSinceProgress, sessionsSinceProgress, suggestion } = suggestProgression({
      history,
      category: ex.category,
      repRangeMax: ex.repRangeMax,
      tryMoreAfterWorkouts,
      counterShift: { adjust: ex.tryMoreCounterAdjust, anchor: ex.tryMoreCounterAnchor },
      now,
    });

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

export type SuggestProgressionInput = {
  history: HistoryPoint[]; // non-empty, chronological
  category: ExerciseProgression['category'];
  repRangeMax: number;
  tryMoreAfterWorkouts: number | null;
  // exercises.tryMoreCounterAdjust/Anchor - see applyCounterShift.
  counterShift?: CounterShift;
  now: Date;
};

export type CounterShift = { adjust: number; anchor: string | null };

// The user's manual shift of the sessions-without-progress counter (the
// try-more slider): applies only while the last progress is still the one
// it was set against, so the next real progress restarts the count clean.
export function applyCounterShift(
  lastProgress: { date: string; sessionsSince: number },
  shift: CounterShift | undefined,
): number {
  if (!shift || shift.adjust === 0 || shift.anchor !== lastProgress.date) return lastProgress.sessionsSince;
  return Math.max(0, lastProgress.sessionsSince + shift.adjust);
}

// The shift that makes the counter read `sessionsDone` right now (what the
// slider was dragged to), or null if the exercise has no history yet.
export async function computeCounterShift(
  exerciseId: string,
  sessionsDone: number,
  executor: Executor = db,
): Promise<CounterShift | null> {
  const lastProgress = findLastProgress(await buildHistory(exerciseId, executor));
  if (!lastProgress) return null;
  const adjust = sessionsDone - lastProgress.sessionsSince;
  return adjust === 0 ? { adjust: 0, anchor: null } : { adjust, anchor: lastProgress.date };
}

// The progression rules (see README "Progression logic"), DB-free:
// 1. top of the rep range reached -> add weight (or, for a bodyweight
//    exercise done without weight, start adding some);
// 2. otherwise no progress (see findLastProgress) for 14+ days - or for N
//    workouts when the owning program sets tryMoreAfterWorkouts for this
//    exercise - -> a soft "try more" nudge;
// 3. otherwise ok.
export function suggestProgression(input: SuggestProgressionInput) {
  const { history, category, repRangeMax, tryMoreAfterWorkouts, counterShift, now } = input;
  const last = history[history.length - 1];
  const lastDate = new Date(`${last.date}T00:00:00Z`);
  const daysSinceLastWorkout = daysBetween(lastDate, now);
  const lastProgress = findLastProgress(history);
  const daysSinceProgress = lastProgress
    ? daysBetween(new Date(`${lastProgress.date}T00:00:00Z`), now)
    : null;
  const sessionsSinceProgress = lastProgress ? applyCounterShift(lastProgress, counterShift) : null;

  const atTopOfRange = last.maxReps >= repRangeMax;
  const hasWeight = last.totalWeightKg != null && last.totalWeightKg > 0;

  const stalled =
    tryMoreAfterWorkouts != null
      ? sessionsSinceProgress != null && sessionsSinceProgress >= tryMoreAfterWorkouts
      : daysSinceProgress != null && daysSinceProgress >= PROGRESS_REMINDER_DAYS;

  let suggestion: ProgressionSuggestion;

  if (atTopOfRange && category === 'bodyweight' && !hasWeight) {
    suggestion = 'start_adding_weight';
  } else if (atTopOfRange) {
    suggestion = 'increase_weight';
  } else if (stalled) {
    suggestion = 'try_more';
  } else {
    suggestion = 'ok';
  }

  return { daysSinceLastWorkout, daysSinceProgress, sessionsSinceProgress, suggestion };
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
