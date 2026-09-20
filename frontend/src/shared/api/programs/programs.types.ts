export type SaveProgramExerciseBody = {
  exerciseId: string;
  targetSets: number;
};

export type SaveProgramBody = {
  name: string;
  exercises: SaveProgramExerciseBody[];
};
