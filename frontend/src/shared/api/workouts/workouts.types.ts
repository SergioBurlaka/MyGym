import type { Workout } from '../../../types/index.js';

export type WorkoutsListParams = { page?: number; pageSize?: number };

export type WorkoutsPage = {
  data: Workout[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type StartWorkoutBody = {
  date?: string;
  programLabel?: string | null;
  copyFromWorkoutId?: string;
  programId?: string;
};

export type UpdateWorkoutBody = {
  programLabel?: string | null;
  date?: string;
};

export type SaveWorkoutExercisesBody = {
  exercises: {
    exerciseId: string;
    weightPerUnitKg: number | null;
    weightUnits: number | null;
    sets: { setNumber: number; reps: number }[];
  }[];
};
