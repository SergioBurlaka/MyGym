export type Equipment = 'barbell' | 'dumbbell' | 'bodyweight';
export type MuscleCategory = 'large' | 'small' | 'bodyweight';

export type Exercise = {
  id: string;
  userId: string;
  name: string;
  equipment: Equipment;
  category: MuscleCategory;
  repRangeMin: number;
  repRangeMax: number;
  weightStepKg: string;
  archivedAt: string | null;
  createdAt: string;
};

export type SetRow = {
  id: string;
  setNumber: number;
  reps: number;
};

export type WorkoutExercise = {
  id: string;
  exerciseId: string;
  weightPerUnitKg: string | null;
  weightUnits: number | null;
  notes: string | null;
  orderIndex: number;
  exercise: Exercise;
  sets: SetRow[];
};

export type Workout = {
  id: string;
  userId: string;
  date: string;
  timeStart: string | null;
  timeEnd: string | null;
  createdAt: string;
  workoutExercises: WorkoutExercise[];
};

export type ProgressionSuggestion = 'no_data' | 'ok' | 'try_more' | 'increase_weight' | 'start_adding_weight';

export type ExerciseProgression = {
  exerciseId: string;
  name: string;
  category: MuscleCategory;
  repRangeMin: number;
  repRangeMax: number;
  weightStepKg: number;
  lastWorkoutDate: string | null;
  lastTotalWeightKg: number | null;
  lastMaxReps: number | null;
  daysSinceLastWorkout: number | null;
  daysSinceProgress: number | null;
  suggestion: ProgressionSuggestion;
  message: string;
};

export type HistoryPoint = {
  date: string;
  totalWeightKg: number | null;
  maxReps: number;
  avgReps: number;
  setsCount: number;
};

export type ImportSummary = {
  workoutsImported: number;
  workoutsSkippedExisting: string[];
  setsImported: number;
  exercisesCreated: string[];
  rowsSkipped: number;
};
