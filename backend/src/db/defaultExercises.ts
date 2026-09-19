// The 13 exercises from the user's original spreadsheet, with the
// progression rules agreed on: category decides the rep range and the
// weight increment applied per side/unit once the top of the range is hit.
//
// large      -> 6-15 reps, +1.25 kg per side
// small      -> 6-20 reps, +0.5 kg per side
// bodyweight -> 6-30 reps, no external weight yet; once a weight is logged
//               for the first time it behaves like "small" going forward
//               (handled in the progression service, not here).

export type DefaultExercise = {
  name: string;
  equipment: 'barbell' | 'dumbbell' | 'bodyweight';
  category: 'large' | 'small' | 'bodyweight';
  repRangeMin: number;
  repRangeMax: number;
  weightStepKg: string;
};

export const DEFAULT_EXERCISES: DefaultExercise[] = [
  { name: 'Присідання', equipment: 'barbell', category: 'large', repRangeMin: 6, repRangeMax: 15, weightStepKg: '1.25' },
  { name: 'Випади', equipment: 'dumbbell', category: 'large', repRangeMin: 6, repRangeMax: 15, weightStepKg: '1.25' },
  { name: 'Жим штанги лежачи', equipment: 'barbell', category: 'large', repRangeMin: 6, repRangeMax: 15, weightStepKg: '1.25' },
  { name: 'Тяга в нахилі', equipment: 'barbell', category: 'large', repRangeMin: 6, repRangeMax: 15, weightStepKg: '1.25' },
  { name: 'Станова тяга', equipment: 'barbell', category: 'large', repRangeMin: 6, repRangeMax: 15, weightStepKg: '1.25' },
  { name: 'Піднімання на біцепс', equipment: 'dumbbell', category: 'small', repRangeMin: 6, repRangeMax: 20, weightStepKg: '0.5' },
  { name: 'Розведення в нахилі в сторону', equipment: 'dumbbell', category: 'small', repRangeMin: 6, repRangeMax: 20, weightStepKg: '0.5' },
  { name: 'Розведення в сторону стоячи', equipment: 'dumbbell', category: 'small', repRangeMin: 6, repRangeMax: 20, weightStepKg: '0.5' },
  { name: 'Французький жим сидячи', equipment: 'dumbbell', category: 'small', repRangeMin: 6, repRangeMax: 20, weightStepKg: '0.5' },
  { name: 'Жим стоячи', equipment: 'barbell', category: 'small', repRangeMin: 6, repRangeMax: 20, weightStepKg: '0.5' },
  { name: 'Віджимання', equipment: 'bodyweight', category: 'bodyweight', repRangeMin: 6, repRangeMax: 30, weightStepKg: '0.5' },
  { name: 'Підняття ніг на прес (шведська стінка)', equipment: 'bodyweight', category: 'bodyweight', repRangeMin: 6, repRangeMax: 30, weightStepKg: '0.5' },
  { name: 'Підняття корпусу на прес', equipment: 'bodyweight', category: 'bodyweight', repRangeMin: 6, repRangeMax: 30, weightStepKg: '0.5' },
];
