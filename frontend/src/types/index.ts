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
  // Only on journal listings (GET /api/workouts): the try-more counter as
  // of this workout.
  progressAt?: WorkoutProgressAt | null;
};

export type WorkoutProgressAt = {
  date: string;
  isFirst: boolean;
  isProgress: boolean;
  atTopOfRange: boolean;
  sessionsSinceProgress: number;
  daysSinceProgress: number;
  // First session after a 14+ day training break - the counter restarted.
  afterBreak: boolean;
  // Program's threshold, else the category default.
  tryMoreAfterWorkouts: number;
};

export type Workout = {
  id: string;
  userId: string;
  date: string;
  timeStart: string | null;
  timeEnd: string | null;
  // timeEnd was set by the server after an hour without activity.
  autoFinished: boolean;
  programLabel: string | null;
  programId: string | null;
  // Only present (non-null) while the linked Program still exists.
  program?: { id: string; name: string } | null;
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
  targetSets: number;
  // Overrides Program.tryMoreAfterWorkouts for this exercise; null inherits it.
  tryMoreAfterWorkouts: number | null;
  orderIndex: number;
  exercise: Exercise;
};

export type Program = {
  id: string;
  userId: string;
  name: string;
  orderIndex: number;
  // Workouts without progress before "try_more" for this program's
  // exercises; null keeps the category default.
  tryMoreAfterWorkouts: number | null;
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
  sessionsSinceProgress: number | null;
  // Smallest across the exercise's programs, else the category default.
  tryMoreAfterWorkouts: number;
  tryMoreIsDefault: boolean;
  suggestion: ProgressionSuggestion;
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
