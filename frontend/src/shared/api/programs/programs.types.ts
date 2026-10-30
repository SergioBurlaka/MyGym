export type SaveProgramExerciseBody = {
  exerciseId: string;
  targetSets: number;
  tryMoreAfterWorkouts?: number | null;
  lockSets?: boolean;
  sessionsDone?: number;
};

export type SaveProgramBody = {
  name: string;
  exercises: SaveProgramExerciseBody[];
  tryMoreAfterWorkouts?: number | null;
};
