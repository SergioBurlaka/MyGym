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
  programLabel: string | null;
  createdAt: string;
  workoutExercises: WorkoutExercise[];
};

export type WorkoutTemplate = {
  label: string;
  workoutId: string;
  date: string;
  exerciseNames: string[];
};

export type WorkoutDateSummary = {
  date: string;
  programLabel: string | null;
  exerciseNames: string[];
};

export type ProgramExercise = {
  id: string;
  exerciseId: string;
  weightPerUnitKg: string | null;
  weightUnits: number | null;
  orderIndex: number;
  exercise: Exercise;
};

export type Program = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  programExercises: ProgramExercise[];
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
  estimatedOneRepMaxKg: number | null;
  volumeKg: number | null;
  totalReps: number;
  isWeightPR: boolean;
  isRepsPR: boolean;
};

export type WeeklyCategoryVolume = {
  weekStart: string;
  large: number;
  small: number;
  bodyweight: number;
};

export type ImportSummary = {
  workoutsImported: number;
  workoutsSkippedExisting: string[];
  setsImported: number;
  exercisesCreated: string[];
  rowsSkipped: number;
};
