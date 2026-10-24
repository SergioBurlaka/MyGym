import { and, eq, gte, inArray, isNull, asc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { exercises, workoutExercises, workouts, sets, programs, programExercises, users } from '../../db/schema.js';

// Default try_more threshold - sessions of the exercise without progress -
// when neither its program entry nor the program sets one. Lower for big
// compound lifts, higher where load steps are relatively coarse (small
// muscles) or progress is reps-only and noisier (bodyweight). See
// docs/research/try-more-threshold.md for the reasoning.
export const DEFAULT_TRY_MORE_AFTER_WORKOUTS = { large: 4, small: 6, bodyweight: 5 } as const;

// Breaks in training (longest gap between any two of the user's workouts):
// a 10-13 day break pauses the counter for the first session back, 14+ days
// resets it - performance right after a break is rust, not a plateau.
export const BREAK_PAUSE_DAYS = 10;
export const BREAK_RESET_DAYS = 14;

export function effectiveTryMoreAfterWorkouts(
  explicit: number | null | undefined,
  category: keyof typeof DEFAULT_TRY_MORE_AFTER_WORKOUTS,
): number {
  return explicit != null && explicit >= 1 ? explicit : DEFAULT_TRY_MORE_AFTER_WORKOUTS[category];
}

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
  // Sessions without progress before `try_more`: from the owning Program
  // (the exercise's own value there, else the program's; the smallest
  // across programs), else DEFAULT_TRY_MORE_AFTER_WORKOUTS for the category.
  tryMoreAfterWorkouts: number;
  // True when tryMoreAfterWorkouts is the category default, not a program's.
  tryMoreIsDefault: boolean;
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

// Longest gap, in days, between consecutive dates of `workoutDates`
// (sorted, unique) that fall within [from, to] - how long the user was away
// from training between two sessions of one exercise. `to` counts as a
// workout day even if absent (used with "today").
export function longestBreak(workoutDates: string[], from: string, to: string): number {
  let longest = 0;
  let prev = from;
  for (const d of workoutDates) {
    if (d <= from) continue;
    if (d > to) break;
    longest = Math.max(longest, dayDiff(prev, d));
    prev = d;
  }
  return Math.max(longest, dayDiff(prev, to));
}

// Start of the most recent gap of `minDays`+ within [from, to] (same rules
// as longestBreak), or null if there is none.
function lastLongBreakStart(workoutDates: string[], from: string, to: string, minDays: number): string | null {
  let found: string | null = null;
  let prev = from;
  for (const d of workoutDates) {
    if (d <= from) continue;
    if (d > to) break;
    if (dayDiff(prev, d) >= minDays) found = prev;
    prev = d;
  }
  if (dayDiff(prev, to) >= minDays) found = prev;
  return found;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayDiff(from: string, to: string): number {
  return daysBetween(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`));
}

type CounterStep = {
  isProgress: boolean;
  // Counter restarted after a 14+ day break (not a progress).
  afterBreak: boolean;
  // Index of the session the counter counts from (last progress or reset).
  baselineIndex: number;
  sessionsSinceProgress: number;
};

// The sessions-without-progress counter after each session of a
// chronological history. Progress (see isProgressStep) restarts it; a
// 14+ day training break restarts it too; the first session after a 10-13
// day break doesn't add to it. Without `workoutDates` breaks are ignored.
function walkCounter(history: HistoryPoint[], workoutDates: string[] = []): CounterStep[] {
  const steps: CounterStep[] = [];
  let baselineIndex = 0;
  let counter = 0;
  history.forEach((cur, i) => {
    let isProgress = false;
    let afterBreak = false;
    if (i > 0) {
      const brk = workoutDates.length > 0 ? longestBreak(workoutDates, history[i - 1].date, cur.date) : 0;
      // A real progress right after a break is still shown as progress.
      if (isProgressStep(history[i - 1], cur)) {
        isProgress = true;
        baselineIndex = i;
        counter = 0;
      } else if (brk >= BREAK_RESET_DAYS) {
        afterBreak = true;
        baselineIndex = i;
        counter = 0;
      } else if (brk < BREAK_PAUSE_DAYS) {
        counter++;
      }
    }
    steps.push({ isProgress, afterBreak, baselineIndex, sessionsSinceProgress: counter });
  });
  return steps;
}

// Where the counter stands now: the date it counts from (last progress, a
// reset after a break, or the first session if neither) and how many
// sessions have added to it since. With `asOf` (today), a 14+ day break
// since the last session already resets it - the count is stale. The date
// returned then is the day after the break began: stable as days pass (the
// slider's anchor keeps matching) and never a session date (an anchor set
// before the break no longer matches).
// Progress = a bigger session volume or a heavier working weight than the
// session before (see isProgressStep).
export function findLastProgress(
  history: HistoryPoint[],
  workoutDates: string[] = [],
  asOf?: string,
): { date: string; sessionsSince: number } | null {
  if (history.length === 0) return null;
  const last = history[history.length - 1];
  if (asOf && workoutDates.length > 0) {
    const breakStart = lastLongBreakStart(workoutDates, last.date, asOf, BREAK_RESET_DAYS);
    if (breakStart) return { date: addDays(breakStart, 1), sessionsSince: 0 };
  }
  const step = walkCounter(history, workoutDates).at(-1)!;
  return { date: history[step.baselineIndex].date, sessionsSince: step.sessionsSinceProgress };
}

// Weight going up always counts (heavier weight often means fewer reps, so
// the volume alone could even drop; going from no weight to some counts
// too). Volumes are only compared between two weighted or two unweighted
// sessions: kg * reps vs plain reps would be meaningless.
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
  // First session after a 14+ day break - the counter restarted here.
  afterBreak: boolean;
  atTopOfRange: boolean;
  // As of this session (0 when it progressed), same meaning as in
  // ExerciseProgression but frozen at that date.
  sessionsSinceProgress: number;
  daysSinceProgress: number;
};

// Where the progress counter stood after each session of a chronological
// history - the journal shows it per workout. Same walk as findLastProgress,
// so the last point agrees with it.
export function progressTimeline(
  history: HistoryPoint[],
  repRangeMax: number,
  workoutDates: string[] = [],
): TimelinePoint[] {
  const steps = walkCounter(history, workoutDates);
  return history.map((cur, i) => ({
    date: cur.date,
    isFirst: i === 0,
    isProgress: steps[i].isProgress,
    afterBreak: steps[i].afterBreak,
    atTopOfRange: cur.maxReps >= repRangeMax,
    sessionsSinceProgress: steps[i].sessionsSinceProgress,
    daysSinceProgress: dayDiff(history[steps[i].baselineIndex].date, cur.date),
  }));
}

// All dates the user trained on (sorted, unique) - breaks are measured
// across every workout, not per exercise: with an A/B split an exercise
// naturally skips a week.
export async function getWorkoutDates(userId: string, executor: Executor = db): Promise<string[]> {
  // Only workouts with at least one logged set - an empty, abandoned one
  // in the middle of a break shouldn't hide the break.
  const rows = await executor
    .selectDistinct({ date: workouts.date })
    .from(workouts)
    .innerJoin(workoutExercises, eq(workoutExercises.workoutId, workouts.id))
    .innerJoin(sets, eq(sets.workoutExerciseId, workoutExercises.id))
    .where(eq(workouts.userId, userId))
    .orderBy(asc(workouts.date));
  return rows.map((r) => r.date);
}

// Today's date in the user's time zone - workout dates are local, so the
// break test must be too (UTC would be a day off around midnight).
export async function getUserToday(userId: string, executor: Executor = db, now = new Date()): Promise<string> {
  const [user] = await executor.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
  return localDate(now, user?.timezone);
}

export function localDate(now: Date, timezone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone ?? 'UTC' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

// Smallest effective tryMoreAfterWorkouts across all of the user's programs
// that include a given exercise - the exercise's own value in that program
// (programExercises.tryMoreAfterWorkouts), else the program's. Exercises in
// no program, or with neither value set, are absent (category default applies).
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
type Executor = Pick<typeof db, 'select' | 'selectDistinct'>;

// One query for the logged sets of several exercises, grouped by exercise
// (in HISTORY_ORDER within each) - instead of one query per exercise.
async function loadHistoryRows(
  userId: string,
  exerciseIds: string[],
  executor: Executor = db,
): Promise<Map<string, HistoryRow[]>> {
  const byExercise = new Map<string, HistoryRow[]>();
  if (exerciseIds.length === 0) return byExercise;

  const rows = await executor
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
    .orderBy(...HISTORY_ORDER);

  for (const { exerciseId, ...row } of rows) {
    const list = byExercise.get(exerciseId);
    if (list) list.push(row);
    else byExercise.set(exerciseId, [row]);
  }
  return byExercise;
}

export type HistoryRow = {
  date: string;
  weightPerUnitKg: string | null;
  weightUnits: number | null;
  reps: number;
};

// One exercise's rows from loadHistoryRows in - one row per logged set -
// one point per workout date out (chronological). Kept DB-free so it can
// be unit-tested.
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
  // exercise since this is called once per exercise.
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
  // program, else the smallest across programs, else the category default).
  tryMoreAfterWorkouts: number;
};

type JournalWorkout = {
  date: string;
  programId: string | null;
  workoutExercises: {
    exerciseId: string;
    exercise: {
      category: ExerciseProgression['category'];
      repRangeMax: number;
      tryMoreCounterAdjust: number;
      tryMoreCounterAnchor: string | null;
    };
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

  const [rowsByExercise, peRows, smallestThresholds, workoutDates, today] = await Promise.all([
    loadHistoryRows(userId, exerciseIds),
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
    getWorkoutDates(userId),
    getUserToday(userId),
  ]);

  const programThresholds = new Map<string, number | null>();
  for (const r of peRows) programThresholds.set(`${r.programId}:${r.exerciseId}`, r.exerciseValue ?? r.programValue);

  const timelines = new Map<string, Map<string, TimelinePoint>>();
  function timelineOf(we: JournalWorkout['workoutExercises'][number]) {
    let byDate = timelines.get(we.exerciseId);
    if (!byDate) {
      const history = buildHistoryPoints(rowsByExercise.get(we.exerciseId) ?? []);
      const points = progressTimeline(history, we.exercise.repRangeMax, workoutDates);
      // With today, as the overview does: after a long break the slider's
      // anchor is the break, not this session, so the shift stays off here.
      const lastProgress = findLastProgress(history, workoutDates, today);
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
          last.afterBreak = false;
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
        ? {
            ...point,
            tryMoreAfterWorkouts: effectiveTryMoreAfterWorkouts(
              fromProgram ?? smallestThresholds.get(we.exerciseId),
              we.exercise.category,
            ),
          }
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
  const rows = await loadHistoryRows(userId, [exerciseId]);
  return buildHistoryPoints(rows.get(exerciseId) ?? []);
}

export async function getProgressionOverview(userId: string): Promise<ExerciseProgression[]> {
  const userExercises = await db.query.exercises.findMany({
    where: and(eq(exercises.userId, userId), isNull(exercises.archivedAt)),
    orderBy: (ex, { asc: ascOrder }) => [ascOrder(ex.name)],
  });

  const [rowsByExercise, tryMoreAfterWorkoutsByExercise, workoutDates, today] = await Promise.all([
    loadHistoryRows(userId, userExercises.map((ex) => ex.id)),
    getTryMoreAfterWorkoutsByExercise(userId),
    getWorkoutDates(userId),
    getUserToday(userId),
  ]);

  const now = new Date();
  const results: ExerciseProgression[] = [];

  for (const ex of userExercises) {
    const history = buildHistoryPoints(rowsByExercise.get(ex.id) ?? []);
    const weightStepKg = Number(ex.weightStepKg);
    const fromPrograms = tryMoreAfterWorkoutsByExercise.get(ex.id);
    const tryMoreAfterWorkouts = effectiveTryMoreAfterWorkouts(fromPrograms, ex.category);
    const tryMoreIsDefault = fromPrograms == null;

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
        tryMoreIsDefault,
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
      workoutDates,
      today,
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
      tryMoreIsDefault,
      suggestion,
    });
  }

  return results;
}

export type SuggestProgressionInput = {
  history: HistoryPoint[]; // non-empty, chronological
  category: ExerciseProgression['category'];
  repRangeMax: number;
  // Effective threshold (see effectiveTryMoreAfterWorkouts).
  tryMoreAfterWorkouts: number;
  // exercises.tryMoreCounterAdjust/Anchor - see applyCounterShift.
  counterShift?: CounterShift;
  // All the user's workout dates, for break handling (see walkCounter).
  workoutDates?: string[];
  // Today in the user's time zone (defaults to now's UTC date).
  today?: string;
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

// The shift that makes each exercise's counter read its `sessionsDone`
// right now (where the slider was dragged to). Exercises with no history
// yet are left out. The caller has checked the exercises are the user's.
export async function computeCounterShifts(
  userId: string,
  positions: { exerciseId: string; sessionsDone: number }[],
  executor: Executor = db,
): Promise<Map<string, CounterShift>> {
  const shifts = new Map<string, CounterShift>();
  if (positions.length === 0) return shifts;
  // Sequential: `executor` may be a transaction (one connection).
  const workoutDates = await getWorkoutDates(userId, executor);
  const today = await getUserToday(userId, executor);
  const rowsByExercise = await loadHistoryRows(userId, positions.map((p) => p.exerciseId), executor);
  for (const { exerciseId, sessionsDone } of positions) {
    const lastProgress = findLastProgress(buildHistoryPoints(rowsByExercise.get(exerciseId) ?? []), workoutDates, today);
    if (!lastProgress) continue;
    const adjust = sessionsDone - lastProgress.sessionsSince;
    shifts.set(exerciseId, adjust === 0 ? { adjust: 0, anchor: null } : { adjust, anchor: lastProgress.date });
  }
  return shifts;
}

// The progression rules (see README "Progression logic"), DB-free:
// 1. top of the rep range reached -> add weight (or, for a bodyweight
//    exercise done without weight, start adding some);
// 2. otherwise N sessions of the exercise without progress (see
//    findLastProgress; N from the program or the category default) -> a
//    soft "try more" nudge;
// 3. otherwise ok.
export function suggestProgression(input: SuggestProgressionInput) {
  const { history, category, repRangeMax, tryMoreAfterWorkouts, counterShift, workoutDates = [], now } = input;
  const today = input.today ?? now.toISOString().slice(0, 10);
  const last = history[history.length - 1];
  const lastDate = new Date(`${last.date}T00:00:00Z`);
  const daysSinceLastWorkout = daysBetween(lastDate, now);
  const lastProgress = findLastProgress(history, workoutDates, today);
  const daysSinceProgress = lastProgress
    ? daysBetween(new Date(`${lastProgress.date}T00:00:00Z`), now)
    : null;
  const sessionsSinceProgress = lastProgress ? applyCounterShift(lastProgress, counterShift) : null;

  const atTopOfRange = last.maxReps >= repRangeMax;
  const hasWeight = last.totalWeightKg != null && last.totalWeightKg > 0;

  const stalled = sessionsSinceProgress != null && sessionsSinceProgress >= tryMoreAfterWorkouts;

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
// (sums to the same totalWeightKg * totalReps as buildHistoryPoints' volumeKg);
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
