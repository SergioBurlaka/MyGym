import { parse } from 'csv-parse/sync';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { exercises, workouts, workoutExercises, sets } from '../../db/schema.js';
import { buildColumnLayout } from './importColumns.js';
import { DEFAULT_BAR_KG, DEFAULT_EXERCISES } from '../../db/defaultExercises.js';
import { storedLoad } from '../workouts/workouts.service.js';

type ParsedSet = { setNumber: number; reps: number };
type ParsedExercise = {
  name: string;
  weightPerUnitKg: number | null;
  weightUnits: number | null;
  sets: ParsedSet[];
};
type ParsedWorkout = {
  date: string; // YYYY-MM-DD
  exercisesByName: Map<string, ParsedExercise>;
};

export type ImportSummary = {
  workoutsImported: number;
  workoutsSkippedExisting: string[];
  setsImported: number;
  exercisesCreated: string[];
  rowsSkipped: number;
};

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || String(v).trim() === '';
}

// "16.09.2026" -> "2026-09-16"
function parseSheetDate(raw: string): string | null {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

// Same bounds as the API and the DB checks (workout_exercises_*_check, sets_reps_check).
const MAX_WEIGHT_PER_UNIT_KG = 500;
const MAX_REPS = 200;

// "2*16.25" -> { units: 2, perUnit: 16.25 }; "20" -> { units: 1, perUnit: 20 }
function parseWeightCell(raw: string): { units: number; perUnit: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const multMatch = /^(\d+)\s*[*xх×]\s*(\d+(?:[.,]\d+)?)$/i.exec(trimmed);
  if (multMatch) {
    return { units: Number(multMatch[1]), perUnit: Number(multMatch[2].replace(',', '.')) };
  }
  const plain = Number(trimmed.replace(',', '.'));
  if (Number.isFinite(plain)) {
    return { units: 1, perUnit: plain };
  }
  return null;
}

function parseSetNumber(label: string): number | null {
  const match = /(\d+)/.exec(label);
  return match ? Number(match[1]) : null;
}

export function parseWorkoutCsv(fileContent: string): { workouts: ParsedWorkout[]; rowsSkipped: number } {
  const rows: string[][] = parse(fileContent, {
    skip_empty_lines: false,
    relax_column_count: true,
    bom: true,
  });

  const layout = buildColumnLayout();
  const dataRows = rows.slice(1); // drop header row

  const parsedWorkouts: ParsedWorkout[] = [];
  let current: ParsedWorkout | null = null;
  let rowsSkipped = 0;

  for (const row of dataRows) {
    const label = row[0] ?? '';
    const dateRaw = row[1] ?? '';

    if (!isBlank(dateRaw)) {
      const date = parseSheetDate(dateRaw);
      if (date) {
        current = { date, exercisesByName: new Map() };
        parsedWorkouts.push(current);
      } else {
        rowsSkipped++;
        continue;
      }
    }

    const setNumber = parseSetNumber(label);
    if (setNumber === null || !current) {
      // Blank separator row, or a stray row before any date was seen.
      if (!row.every((cell) => isBlank(cell))) rowsSkipped++;
      continue;
    }

    for (const col of layout) {
      const repsRaw = row[col.repsIdx];
      if (isBlank(repsRaw)) continue;
      const reps = Number(String(repsRaw).trim());
      if (!Number.isFinite(reps)) continue;
      // A typo the DB checks would refuse: skip the cell instead of failing the import.
      if (!Number.isInteger(reps) || reps < 0 || reps > MAX_REPS) {
        rowsSkipped++;
        continue;
      }

      let parsedWeight: { units: number; perUnit: number } | null = null;
      const weightRaw = col.hasWeight && col.weightIdx !== null ? row[col.weightIdx] : undefined;
      if (!isBlank(weightRaw)) {
        parsedWeight = parseWeightCell(String(weightRaw));
        if (
          parsedWeight &&
          (![1, 2].includes(parsedWeight.units) || parsedWeight.perUnit < 0 || parsedWeight.perUnit > MAX_WEIGHT_PER_UNIT_KG)
        ) {
          rowsSkipped++;
          continue;
        }
      }

      let entry = current.exercisesByName.get(col.name);
      if (!entry) {
        entry = { name: col.name, weightPerUnitKg: null, weightUnits: null, sets: [] };
        current.exercisesByName.set(col.name, entry);
      }
      entry.sets.push({ setNumber, reps });

      if (parsedWeight && entry.weightPerUnitKg === null) {
        entry.weightPerUnitKg = parsedWeight.perUnit;
        entry.weightUnits = parsedWeight.units;
      }
    }
  }

  return { workouts: parsedWorkouts.filter((w) => w.exercisesByName.size > 0), rowsSkipped };
}

export async function importWorkoutCsv(userId: string, fileContent: string): Promise<ImportSummary> {
  const { workouts: parsedWorkouts, rowsSkipped } = parseWorkoutCsv(fileContent);

  const userExercises = await db.query.exercises.findMany({ where: eq(exercises.userId, userId) });
  const byName = new Map(userExercises.map((e) => [e.name.trim().toLowerCase(), e]));
  const exercisesCreated: string[] = [];

  async function resolveExercise(name: string) {
    const key = name.trim().toLowerCase();
    const existing = byName.get(key);
    if (existing) return existing;

    const defaults = DEFAULT_EXERCISES.find((d) => d.name.trim().toLowerCase() === key);
    const [created] = await db
      .insert(exercises)
      .values({
        userId,
        name,
        equipment: defaults?.equipment ?? 'barbell',
        category: defaults?.category ?? 'large',
        repRangeMin: defaults?.repRangeMin ?? 6,
        repRangeMax: defaults?.repRangeMax ?? 15,
        weightStepKg: defaults?.weightStepKg ?? '1.25',
        unilateral: defaults?.limb != null,
        limb: defaults?.limb ?? null,
        defaultBarKg: (defaults?.equipment ?? 'barbell') === 'barbell' ? DEFAULT_BAR_KG : null,
      })
      .returning();
    byName.set(key, created);
    exercisesCreated.push(name);
    return created;
  }

  const summary: ImportSummary = {
    workoutsImported: 0,
    workoutsSkippedExisting: [],
    setsImported: 0,
    exercisesCreated: [],
    rowsSkipped,
  };

  for (const parsedWorkout of parsedWorkouts) {
    const existingWorkout = await db.query.workouts.findFirst({
      where: and(eq(workouts.userId, userId), eq(workouts.date, parsedWorkout.date)),
    });
    if (existingWorkout) {
      summary.workoutsSkippedExisting.push(parsedWorkout.date);
      continue;
    }

    await db.transaction(async (tx) => {
      const [workout] = await tx
        .insert(workouts)
        .values({ userId, date: parsedWorkout.date })
        .returning();

      let orderIndex = 0;
      for (const [, entry] of parsedWorkout.exercisesByName) {
        const exercise = await resolveExercise(entry.name);

        const [we] = await tx
          .insert(workoutExercises)
          .values({
            workoutId: workout.id,
            exerciseId: exercise.id,
            // A barbell's bar is the exercise's default (the sheet has no bar column).
            ...storedLoad(exercise, entry),
            orderIndex: orderIndex++,
          })
          .returning();

        await tx.insert(sets).values(
          entry.sets.map((s) => ({
            workoutExerciseId: we.id,
            setNumber: s.setNumber,
            reps: s.reps,
          })),
        );
        summary.setsImported += entry.sets.length;
      }
    });

    summary.workoutsImported++;
  }

  summary.exercisesCreated = exercisesCreated;
  return summary;
}
