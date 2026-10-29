import type { Equipment, Limb, MuscleCategory } from '../../../types/index.js';

export type CreateExerciseBody = {
  name: string;
  equipment: Equipment;
  category: MuscleCategory;
  repRangeMin: number;
  repRangeMax: number;
  weightStepKg: number;
  unilateral?: boolean;
  limb?: Limb | null;
  defaultBarKg?: number | null;
};

export type UpdateExerciseBody = Partial<CreateExerciseBody>;
