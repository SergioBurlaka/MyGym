import { describe, expect, it } from 'vitest';
import { parseWorkoutCsv } from '../src/modules/import/csvImport.service.js';

// Columns: label, date, start, end, then squat reps/weight, lunges reps/weight, ...
function csv(...rows: string[][]): string {
  return [['header'], ...rows].map((r) => r.join(',')).join('\n');
}

describe('parseWorkoutCsv', () => {
  it('skips cells the DB checks would refuse instead of failing the import', () => {
    const { workouts, rowsSkipped } = parseWorkoutCsv(
      csv(
        ['підхід 1', '16.09.2026', '', '', '10', '3*20', '12', '2*1000'],
        ['підхід 2', '', '', '', '250', '2*20', '12', '2*10'],
        ['підхід 3', '', '', '', '8', '2*20', '', ''],
      ),
    );

    expect(rowsSkipped).toBe(3);
    const [w] = workouts;
    // The 3*20 and 250 cells are dropped; the weight comes from the first valid set.
    expect(w.exercisesByName.get('Присідання')).toMatchObject({
      weightPerUnitKg: 20,
      weightUnits: 2,
      sets: [{ setNumber: 3, reps: 8 }],
    });
    expect(w.exercisesByName.get('Випади')).toMatchObject({
      weightPerUnitKg: 10,
      weightUnits: 2,
      sets: [{ setNumber: 2, reps: 12 }],
    });
  });
});
