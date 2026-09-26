import type { Equipment, MuscleCategory } from '../../../types/index.js';

export type CreateExerciseBody = {
  name: string;
  equipment: Equipment;
  category: MuscleCategory;
  repRangeMin: number;
  repRangeMax: number;
  weightStepKg: number;
};

export type UpdateExerciseBody = Partial<CreateExerciseBody>;
