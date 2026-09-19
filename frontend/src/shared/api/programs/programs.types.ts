export type SaveProgramExerciseBody = {
  exerciseId: string;
  weightPerUnitKg: number | null;
  weightUnits: number | null;
};

export type SaveProgramBody = {
  name: string;
  exercises: SaveProgramExerciseBody[];
};
