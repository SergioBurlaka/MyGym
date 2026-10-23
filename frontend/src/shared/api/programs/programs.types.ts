export type SaveProgramExerciseBody = {
  exerciseId: string;
  targetSets: number;
  tryMoreAfterWorkouts?: number | null;
};

export type SaveProgramBody = {
  name: string;
  exercises: SaveProgramExerciseBody[];
  tryMoreAfterWorkouts?: number | null;
};
