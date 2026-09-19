// Fixed column layout of the user's original Google Sheets export
// (see the sample "___________ - September 2026.csv"): one label column,
// date/time-start/time-end, then one pair of (reps, weight) columns per
// exercise in this exact order - some exercises (bodyweight ones) have no
// weight column at all. This mirrors the sheet, not a generic CSV format,
// which is what makes positional parsing reliable even though several
// headers in the real file contain typos (e.g. "бфципс" for "біцепс").
//
// `name` must match an exercise name seeded by DEFAULT_EXERCISES so the
// importer can find (or recreate) the right exercise record.
export const IMPORT_COLUMN_ORDER: Array<{ name: string; hasWeight: boolean }> = [
  { name: 'Присідання', hasWeight: true },
  { name: 'Випади', hasWeight: true },
  { name: 'Жим штанги лежачи', hasWeight: true },
  { name: 'Тяга в нахилі', hasWeight: true },
  { name: 'Піднімання на біцепс', hasWeight: true },
  { name: 'Розведення в нахилі в сторону', hasWeight: true },
  { name: 'Станова тяга', hasWeight: true },
  { name: 'Жим стоячи', hasWeight: true },
  { name: 'Віджимання', hasWeight: false },
  { name: 'Французький жим сидячи', hasWeight: true },
  { name: 'Розведення в сторону стоячи', hasWeight: true },
  { name: 'Підняття ніг на прес (шведська стінка)', hasWeight: false },
  { name: 'Підняття корпусу на прес', hasWeight: false },
];

export const LABEL_COL = 0;
export const DATE_COL = 1;
export const TIME_START_COL = 2;
export const TIME_END_COL = 3;
export const FIRST_EXERCISE_COL = 4;

export type ColumnLayout = {
  name: string;
  hasWeight: boolean;
  repsIdx: number;
  weightIdx: number | null;
};

export function buildColumnLayout(): ColumnLayout[] {
  const layout: ColumnLayout[] = [];
  let idx = FIRST_EXERCISE_COL;
  for (const col of IMPORT_COLUMN_ORDER) {
    const repsIdx = idx;
    let weightIdx: number | null = null;
    idx += 1;
    if (col.hasWeight) {
      weightIdx = idx;
      idx += 1;
    }
    layout.push({ name: col.name, hasWeight: col.hasWeight, repsIdx, weightIdx });
  }
  return layout;
}
