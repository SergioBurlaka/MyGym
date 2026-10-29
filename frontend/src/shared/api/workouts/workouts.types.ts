import type { Workout } from '../../../types/index.js';

export type WorkoutsListParams = { page?: number; pageSize?: number };

export type WorkoutsPage = {
  data: Workout[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  // How many of the user's workouts are samples (any page) - drives the
  // journal's "remove samples" note.
  sampleCount: number;
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
    barKg?: number | null;
    sets: { setNumber: number; reps: number }[];
  }[];
};
