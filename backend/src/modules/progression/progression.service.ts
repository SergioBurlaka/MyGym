import { and, eq, gte, inArray, isNull, asc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { exercises, workoutExercises, workouts, sets, programs, programExercises, users } from '../../db/schema.js';
import {
  addedLoad,
  loadPerRep,
  sidesOf,
  targetReps,
  totalReps as sumReps,
  volumeKg as sessionVolumeKg,
  type LoadSettings,
} from './load.js';

export type SessionTarget = { reps: number[]; upSetIndex: number };

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
  // Weight moved in ONE rep (load.ts: with the bar for a barbell). Null when
  // no weight was logged.
  totalWeightKg: number | null;
  // As logged that day (numbers; see load.ts for what they mean).
  weightPerUnitKg: number | null;
  weightUnits: number | null;
  // The bar that day (barbell only) and the load without it - plates /
  // dumbbells / added weight, what the user steps up.
  barKg: number | null;
  addedLoadKg: number | null;
  // Logged reps in set order (per side for a unilateral exercise).
  reps: number[];
  maxReps: number;
  avgReps: number;
  setsCount: number;
  // Epley formula (totalWeightKg * (1 + maxReps/30)) - only meaningful when
  // the exercise was done with weight, and unreliable past ~15 reps, but we
  // still compute it (the frontend just needs a trend, not a precise number).
  estimatedOneRepMaxKg: number | null;
  // totalWeightKg * totalReps for weighted exercises; null for bodyweight
  // (use totalReps as the "volume" there instead).
  volumeKg: number | null;
  // Sum of reps, both sides of a unilateral exercise.
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

// Session "volume" used to detect progress: weight * total reps of all
// sets, or just total reps when the exercise was done without weight (or
// with 0 - otherwise 0 * reps would never grow). More sets, more reps or
// more weight all raise it.
function progressVolume(weightKg: number, reps: number): number {
  return weightKg > 0 ? weightKg * reps : reps;
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
// A different bar is neither: "weight" is the added load (plates /
// dumbbells), and this session's volume is taken on the previous bar.
function isProgressStep(prev: HistoryPoint, cur: HistoryPoint): boolean {
  const weightImproved = (cur.addedLoadKg ?? 0) > (prev.addedLoadKg ?? 0);
  const prevWeight = prev.totalWeightKg ?? 0;
  const curWeight = cur.addedLoadKg == null ? 0 : cur.addedLoadKg + (prev.barKg ?? 0);
  const sameKind = curWeight > 0 === prevWeight > 0;
  const volumeImproved =
    sameKind && progressVolume(curWeight, cur.totalReps) > progressVolume(prevWeight, prev.totalReps);
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
  // The session the counter counts from (last progress, a reset, or the first).
  progressDate: string;
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
    progressDate: history[steps[i].baselineIndex].date,
  }));
}

export type PreviousSession = {
  date: string;
  weightPerUnitKg: number | null;
  weightUnits: number | null;
  barKg: number | null;
  loadPerRepKg: number | null;
  // In set order, per side for a unilateral exercise.
  reps: number[];
};

// The workout page's guide for one exercise of the workout dated
// `workoutDate`: the last session before it (placeholders, "last time"),
// and - when the counter stood at "try more" after that session - the
// target: last time's reps with +1 in the weakest set. Not at the top of the
// rep range: there the advice is more weight, not another rep. The slider
// shift counts while that session still counts from the shift's anchor.
// `counterBefore`: workouts without progress after that session (0 with no
// session before, or after a long break) - the workout page's counter until
// something is logged today.
export function sessionGuide(
  history: HistoryPoint[],
  timeline: TimelinePoint[],
  workoutDate: string,
  opts: { tryMoreAfterWorkouts: number; counterShift?: CounterShift; workoutDates?: string[] },
): { previous: PreviousSession | null; target: SessionTarget | null; counterBefore: number } {
  let i = history.length - 1;
  while (i >= 0 && history[i].date >= workoutDate) i--;
  if (i < 0) return { previous: null, target: null, counterBefore: 0 };
  const prev = history[i];
  const point = timeline[i];
  // The slider was set on the exercise's latest session - it only counts
  // when `prev` is that one (nothing later but this workout's own date),
  // not for an older workout's page.
  const isLatest = history.slice(i + 1).every((p) => p.date === workoutDate);
  const sessions = isLatest
    ? applyCounterShift({ date: point.progressDate, sessionsSince: point.sessionsSinceProgress }, opts.counterShift)
    : point.sessionsSinceProgress;
  // After a long break the counter starts over: a weaker session then is a
  // comeback, not a plateau - no +1 target.
  const afterBreak =
    opts.workoutDates != null &&
    opts.workoutDates.length > 0 &&
    longestBreak(opts.workoutDates, prev.date, workoutDate) >= BREAK_RESET_DAYS;
  const stalled = !afterBreak && !point.atTopOfRange && sessions >= opts.tryMoreAfterWorkouts;
  return {
    previous: {
      date: prev.date,
      weightPerUnitKg: prev.weightPerUnitKg,
      weightUnits: prev.weightUnits,
      barKg: prev.barKg,
      loadPerRepKg: prev.totalWeightKg,
      reps: prev.reps,
    },
    target: stalled ? targetReps(prev.reps) : null,
    counterBefore: afterBreak ? 0 : sessions,
  };
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
const HISTORY_ORDER = [
  asc(workouts.date),
  asc(workouts.createdAt),
  asc(workoutExercises.id),
  asc(sets.setNumber),
] as const;

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
      barKg: workoutExercises.barKg,
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
  barKg?: string | null;
  reps: number;
};

// Two dumbbells, limbs together: how rows read before the load model, so a
// caller without the exercise at hand gets the old maths.
const LEGACY_LOAD: LoadSettings = { equipment: 'dumbbell', unilateral: false };

// One exercise's rows from loadHistoryRows in - one row per logged set -
// one point per workout date out (chronological). Kept DB-free so it can
// be unit-tested.
export function buildHistoryPoints(rows: HistoryRow[], exercise: LoadSettings = LEGACY_LOAD): HistoryPoint[] {
  const byDate = new Map<
    string,
    { weightPerUnitKg: string | null; weightUnits: number | null; barKg: string | null; reps: number[] }
  >();
  for (const row of rows) {
    const key = row.date;
    if (!byDate.has(key)) {
      byDate.set(key, {
        weightPerUnitKg: row.weightPerUnitKg,
        weightUnits: row.weightUnits,
        barKg: row.barKg ?? null,
        reps: [],
      });
    }
    byDate.get(key)!.reps.push(row.reps);
  }

  const sorted = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  // Running bests, walked chronologically, to flag PRs (task 5) - reset per
  // exercise since this is called once per exercise.
  let bestWeightKg: number | null = null;
  let bestReps: number | null = null;

  return sorted.map(([date, entry]) => {
    const totalWeightKg = loadPerRep(exercise.equipment, entry);
    const addedLoadKg = addedLoad(exercise.equipment, entry);
    const barKg = exercise.equipment === 'barbell' && entry.barKg != null ? Number(entry.barKg) : null;
    const maxReps = Math.max(...entry.reps);
    const totalReps = sumReps(entry.reps, exercise.unilateral);
    const avgReps = entry.reps.reduce((a, b) => a + b, 0) / entry.reps.length;

    const estimatedOneRepMaxKg =
      totalWeightKg != null ? Math.round(totalWeightKg * (1 + maxReps / 30) * 10) / 10 : null;
    // A logged 0 kg is still a weighted session here (0 volume), as before.
    const volumeKg =
      totalWeightKg != null ? (sessionVolumeKg(totalWeightKg, entry.reps, exercise.unilateral) ?? 0) : null;

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
      weightPerUnitKg: entry.weightPerUnitKg != null ? Number(entry.weightPerUnitKg) : null,
      weightUnits: entry.weightPerUnitKg != null ? entry.weightUnits : null,
      barKg,
      addedLoadKg,
      reps: entry.reps,
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
    weightPerUnitKg: string | null;
    weightUnits: number | null;
    barKg: string | null;
    sets?: { reps: number }[];
    exercise: {
      category: ExerciseProgression['category'];
      equipment: LoadSettings['equipment'];
      unilateral: boolean;
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
// With `guide` (the workout page), each exercise also gets `previous` and
// `target` (see sessionGuide) and its own load per rep and volume.
export async function attachProgressAt<W extends JournalWorkout>(
  userId: string,
  rows: W[],
  opts: { guide?: boolean } = {},
) {
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

  type Timeline = { history: HistoryPoint[]; raw: TimelinePoint[]; byDate: Map<string, TimelinePoint> };
  const timelines = new Map<string, Timeline>();
  function timelineOf(we: JournalWorkout['workoutExercises'][number]): Timeline {
    let timeline = timelines.get(we.exerciseId);
    if (!timeline) {
      const history = buildHistoryPoints(rowsByExercise.get(we.exerciseId) ?? [], we.exercise);
      const raw = progressTimeline(history, we.exercise.repRangeMax, workoutDates);
      const points = raw.map((p) => ({ ...p }));
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
      timeline = { history, raw, byDate: new Map(points.map((p) => [p.date, p])) };
      timelines.set(we.exerciseId, timeline);
    }
    return timeline;
  }

  return rows.map((w) => ({
    ...w,
    workoutExercises: w.workoutExercises.map((we) => {
      const timeline = timelineOf(we);
      const point = timeline.byDate.get(w.date);
      const fromProgram = w.programId != null ? programThresholds.get(`${w.programId}:${we.exerciseId}`) : null;
      const tryMoreAfterWorkouts = effectiveTryMoreAfterWorkouts(
        fromProgram ?? smallestThresholds.get(we.exerciseId),
        we.exercise.category,
      );
      // Nothing done yet (no sets): no state of its own - history is grouped
      // by date, so it would show another same-day workout's.
      const done = (we.sets ?? []).length > 0;
      const progressAt: WorkoutProgressAt | null = point && done ? { ...point, tryMoreAfterWorkouts } : null;
      if (!opts.guide) return { ...we, progressAt };

      const loadPerRepKg = loadPerRep(we.exercise.equipment, we);
      const reps = (we.sets ?? []).map((s) => s.reps);
      const guide = sessionGuide(timeline.history, timeline.raw, w.date, {
        tryMoreAfterWorkouts,
        counterShift: { adjust: we.exercise.tryMoreCounterAdjust, anchor: we.exercise.tryMoreCounterAnchor },
        workoutDates,
      });
      return {
        ...we,
        progressAt,
        previous: guide.previous,
        target: guide.target,
        counterBefore: { sessionsSinceProgress: guide.counterBefore, tryMoreAfterWorkouts },
        loadPerRepKg,
        volumeKg: sessionVolumeKg(loadPerRepKg, reps, we.exercise.unilateral),
      };
    }),
  }));
}

export async function getExerciseHistory(userId: string, exerciseId: string): Promise<HistoryPoint[]> {
  const exercise = await db.query.exercises.findFirst({
    where: and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)),
  });
  if (!exercise) return [];
  const rows = await loadHistoryRows(userId, [exerciseId]);
  return buildHistoryPoints(rows.get(exerciseId) ?? [], exercise);
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
    const history = buildHistoryPoints(rowsByExercise.get(ex.id) ?? [], ex);
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
  const exerciseIds = positions.map((p) => p.exerciseId);
  const rowsByExercise = await loadHistoryRows(userId, exerciseIds, executor);
  const settings = await executor
    .select({ id: exercises.id, equipment: exercises.equipment, unilateral: exercises.unilateral })
    .from(exercises)
    .where(and(eq(exercises.userId, userId), inArray(exercises.id, exerciseIds)));
  const settingsById = new Map(settings.map((s) => [s.id, s]));
  for (const { exerciseId, sessionsDone } of positions) {
    const history = buildHistoryPoints(rowsByExercise.get(exerciseId) ?? [], settingsById.get(exerciseId));
    const lastProgress = findLastProgress(history, workoutDates, today);
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
// for bodyweight exercises (no weight logged), volume = reps. Both sides of
// a unilateral exercise count.
export async function getVolumeByCategory(userId: string, weeks: number): Promise<WeeklyCategoryVolume[]> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - weeks * 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rows = await db
    .select({
      date: workouts.date,
      category: exercises.category,
      equipment: exercises.equipment,
      unilateral: exercises.unilateral,
      weightPerUnitKg: workoutExercises.weightPerUnitKg,
      weightUnits: workoutExercises.weightUnits,
      barKg: workoutExercises.barKg,
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
    const weight = loadPerRep(row.equipment, row);
    const contribution = (weight != null ? weight * row.reps : row.reps) * sidesOf(row.unilateral);
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
