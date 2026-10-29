// The load model, DB-free (mirrored on the frontend in utils/weight.ts -
// change both together). How one logged exercise turns into kilograms:
//
//   barbell    weightPerUnitKg = plates on ONE side, barKg = the bar
//              -> bar + 2 x plates per rep (weightUnits is always 2)
//   dumbbell   weightPerUnitKg = ONE dumbbell, weightUnits = dumbbells
//              moving in ONE rep (1 or 2) -> units x dumbbell
//   bodyweight weightPerUnitKg = added weight (null = none)
//
// A unilateral exercise logs reps per side (left and right one after the
// other), so its volume counts both sides.

export type Equipment = 'barbell' | 'dumbbell' | 'bodyweight';

export type LoadSettings = { equipment: Equipment; unilateral: boolean };

export type LoggedLoad = {
  weightPerUnitKg: string | number | null;
  weightUnits: number | null;
  barKg?: string | number | null;
};

// Rounded to grams so 16.25 x 2 can't come out as 32.49999.
function grams(kg: number): number {
  return Math.round(kg * 1000) / 1000;
}

function num(value: string | number | null | undefined): number | null {
  return value == null ? null : Number(value);
}

// What the user put on: plates (both sides) / dumbbells / added weight -
// the load per rep without the bar. Null when no weight was logged. This is
// what grows when the user steps the weight up in the gym; a different bar
// isn't progress.
export function addedLoad(equipment: Equipment, load: LoggedLoad): number | null {
  const perUnit = num(load.weightPerUnitKg);
  if (perUnit == null) return null;
  if (equipment === 'barbell') return grams(2 * perUnit);
  if (equipment === 'dumbbell') return grams((load.weightUnits ?? 2) * perUnit);
  return perUnit;
}

// Weight moved in one rep. Null when no weight was logged (a barbell's bar
// alone is logged as 0 plates, not as no weight).
export function loadPerRep(equipment: Equipment, load: LoggedLoad): number | null {
  const added = addedLoad(equipment, load);
  if (added == null) return null;
  return equipment === 'barbell' ? grams((num(load.barKg) ?? 0) + added) : added;
}

export function sidesOf(unilateral: boolean): 1 | 2 {
  return unilateral ? 2 : 1;
}

// Reps across both sides for a unilateral exercise, as logged otherwise.
export function totalReps(reps: number[], unilateral: boolean): number {
  return reps.reduce((a, b) => a + b, 0) * sidesOf(unilateral);
}

// kg moved in the session: load per rep x all reps (both sides). Null
// without weight (or with 0) - then totalReps is the volume.
export function volumeKg(loadKg: number | null, reps: number[], unilateral: boolean): number | null {
  if (loadKg == null || loadKg <= 0) return null;
  return grams(loadKg * totalReps(reps, unilateral));
}

// "Try more" target: last time's reps with +1 in ONE set - the weakest
// (fewest reps; the first of equals). -1 for no sets.
export function pickTargetUpSet(reps: number[]): number {
  let index = -1;
  for (let i = 0; i < reps.length; i++) {
    if (index === -1 || reps[i] < reps[index]) index = i;
  }
  return index;
}

export function targetReps(lastReps: number[]): { reps: number[]; upSetIndex: number } | null {
  const upSetIndex = pickTargetUpSet(lastReps);
  if (upSetIndex === -1) return null;
  return { reps: lastReps.map((r, i) => (i === upSetIndex ? r + 1 : r)), upSetIndex };
}

// Reps of set `index` last time, for a placeholder: the same set number, or
// the last one there was when there were fewer sets. Null with no history.
export function lastRepsForSet(lastReps: number[], index: number): number | null {
  if (lastReps.length === 0) return null;
  return lastReps[Math.min(index, lastReps.length - 1)];
}
