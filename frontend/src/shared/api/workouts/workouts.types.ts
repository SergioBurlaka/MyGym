export type WorkoutsListParams = { limit?: number; before?: string };

export type SaveWorkoutExercisesBody = {
  exercises: {
    exerciseId: string;
    weightPerUnitKg: number | null;
    weightUnits: number | null;
    sets: { setNumber: number; reps: number }[];
  }[];
};
