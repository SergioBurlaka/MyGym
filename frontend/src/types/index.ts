export type Equipment = 'barbell' | 'dumbbell' | 'bodyweight';
export type MuscleCategory = 'large' | 'small' | 'bodyweight';
export type Limb = 'arm' | 'leg';

export type Exercise = {
  id: string;
  userId: string;
  name: string;
  equipment: Equipment;
  category: MuscleCategory;
  repRangeMin: number;
  repRangeMax: number;
  weightStepKg: string;
  // Left and right one after the other - reps are per side (see utils/weight.ts).
  unilateral: boolean;
  // Labels per-side reps; only for a unilateral exercise.
  limb: Limb | null;
  // Barbell only: the bar a new workout starts with.
  defaultBarKg: string | null;
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
  // Barbell only: the bar used that day.
  barKg: string | null;
  notes: string | null;
  orderIndex: number;
  exercise: Exercise;
  sets: SetRow[];
  // On the journal listing, a single workout and its save response: the
  // try-more counter as of this workout.
  progressAt?: WorkoutProgressAt | null;
  // Only on a single workout and its save response (the workout page):
  // the last session before this workout, and - when try-more was due -
  // last time's reps with +1 in one set.
  previous?: PreviousSession | null;
  target?: { reps: number[]; upSetIndex: number } | null;
  // The try-more counter as of that last session - the workout page shows
  // it until something is logged today.
  counterBefore?: { sessionsSinceProgress: number; tryMoreAfterWorkouts: number } | null;
  loadPerRepKg?: number | null;
  volumeKg?: number | null;
};

export type PreviousSession = {
  date: string;
  weightPerUnitKg: number | null;
  weightUnits: number | null;
  barKg: number | null;
  loadPerRepKg: number | null;
  reps: number[];
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
  // timeEnd was set by the server after 1.5 hours without activity.
  autoFinished: boolean;
  // Header-timer pause: closed pauses so far, and the start of the one in
  // progress (null = running). Duration = timeEnd - timeStart - pausedMs.
  pausedMs: number;
  pausedAt: string | null;
  // Copied from the template account into a new account; "Remove samples" deletes it.
  isSample: boolean;
  programLabel: string | null;
  programId: string | null;
  // Only present (non-null) while the linked Program still exists.
  program?: { id: string; name: string } | null;
  createdAt: string;
  workoutExercises: WorkoutExercise[];
};

// GET /workouts/active - the open workout the header timer counts.
export type ActiveWorkout = Pick<Workout, 'id' | 'date' | 'programLabel' | 'pausedMs' | 'pausedAt'> & {
  timeStart: string;
};

// What the header timer keeps: the workout plus server time minus this
// device's clock, so a phone clock that is off doesn't shift the stopwatch.
export type ActiveWorkoutState = { workout: ActiveWorkout | null; clockOffsetMs: number };

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
