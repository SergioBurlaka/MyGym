import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { exercises } from '../../db/schema.js';
import { DEFAULT_BAR_KG } from '../../db/defaultExercises.js';
import { isUniqueViolation } from '../../utils/pgErrors.js';
import type { CreateExerciseInput, UpdateExerciseInput } from './exercises.schema.js';

export function listExercises(userId: string) {
  return db.query.exercises.findMany({
    where: and(eq(exercises.userId, userId), isNull(exercises.archivedAt)),
    orderBy: (ex, { asc }) => [asc(ex.name)],
  });
}

// Names are unique per user, archived exercises included
// (exercises_user_name_idx, case- and edge-space-insensitive).
export class ExerciseNameTakenError extends Error {}
export class ExerciseRepRangeError extends Error {}

type Equipment = (typeof exercises.$inferSelect)['equipment'];
type Limb = (typeof exercises.$inferSelect)['limb'];

// The load settings as stored: a limb only for a unilateral exercise, a
// default bar only for a barbell (20 kg unless one is given or kept).
function loadFields(
  equipment: Equipment,
  unilateral: boolean,
  limb: Limb | undefined,
  defaultBarKg: number | string | null | undefined,
) {
  return {
    unilateral,
    limb: unilateral ? (limb ?? null) : null,
    defaultBarKg: equipment === 'barbell' ? (defaultBarKg != null ? String(defaultBarKg) : DEFAULT_BAR_KG) : null,
  };
}

function sameName(userId: string, name: string) {
  return and(eq(exercises.userId, userId), sql`lower(btrim(${exercises.name})) = lower(btrim(${name}))`);
}

// Re-creating an archived exercise's name restores that exercise (with the
// new settings) instead of failing - there's no other way back from the
// archive in the UI, and its history stays attached.
export async function createExercise(userId: string, input: CreateExerciseInput) {
  const fields = {
    name: input.name,
    equipment: input.equipment,
    category: input.category,
    repRangeMin: input.repRangeMin,
    repRangeMax: input.repRangeMax,
    weightStepKg: String(input.weightStepKg),
    ...loadFields(input.equipment, input.unilateral, input.limb, input.defaultBarKg),
  };
  try {
    const existing = await db.query.exercises.findFirst({ where: sameName(userId, input.name) });
    if (existing && existing.archivedAt == null) throw new ExerciseNameTakenError();
    if (existing) {
      const [restored] = await db
        .update(exercises)
        .set({ ...fields, archivedAt: null })
        .where(eq(exercises.id, existing.id))
        .returning();
      return restored;
    }
    const [row] = await db.insert(exercises).values({ userId, ...fields }).returning();
    return row;
  } catch (err) {
    // Two concurrent creates with one name: the index decides.
    if (isUniqueViolation(err)) throw new ExerciseNameTakenError();
    throw err;
  }
}

export async function updateExercise(userId: string, exerciseId: string, input: UpdateExerciseInput) {
  const existing = await db.query.exercises.findFirst({
    where: and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)),
  });
  if (!existing) return null;

  // The Zod refine only sees the fields sent; a lone repRangeMin can still
  // cross the stored max (exercises_rep_range_check would turn it into a 500).
  if ((input.repRangeMin ?? existing.repRangeMin) > (input.repRangeMax ?? existing.repRangeMax)) {
    throw new ExerciseRepRangeError();
  }

  const equipment = input.equipment ?? existing.equipment;
  const unilateral = input.unilateral ?? existing.unilateral;
  const load = loadFields(
    equipment,
    unilateral,
    input.limb !== undefined ? input.limb : existing.limb,
    input.defaultBarKg !== undefined ? input.defaultBarKg : existing.defaultBarKg,
  );

  try {
    const [row] = await db
      .update(exercises)
      .set({
        ...load,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.equipment !== undefined ? { equipment: input.equipment } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.repRangeMin !== undefined ? { repRangeMin: input.repRangeMin } : {}),
        ...(input.repRangeMax !== undefined ? { repRangeMax: input.repRangeMax } : {}),
        ...(input.weightStepKg !== undefined ? { weightStepKg: String(input.weightStepKg) } : {}),
      })
      .where(eq(exercises.id, exerciseId))
      .returning();
    return row;
  } catch (err) {
    // Renamed to a name another exercise (archived too) already has.
    if (isUniqueViolation(err)) throw new ExerciseNameTakenError();
    throw err;
  }
}

export async function archiveExercise(userId: string, exerciseId: string) {
  const existing = await db.query.exercises.findFirst({
    where: and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)),
  });
  if (!existing) return null;

  const [row] = await db
    .update(exercises)
    .set({ archivedAt: new Date() })
    .where(eq(exercises.id, exerciseId))
    .returning();
  return row;
}
