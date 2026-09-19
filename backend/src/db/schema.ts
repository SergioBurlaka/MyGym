import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  smallint,
  numeric,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ---------- enums ----------

export const equipmentEnum = pgEnum('equipment', ['barbell', 'dumbbell', 'bodyweight']);

// large  -> big compound muscle groups (squat, deadlift, bench, row...)
// small  -> isolation / injury-sensitive joints (biceps, lateral raises, shoulder press...)
// bodyweight -> no external load yet (push-ups, leg raises) - becomes "small" once weight is added
export const muscleCategoryEnum = pgEnum('muscle_category', ['large', 'small', 'bodyweight']);

// ---------- users ----------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(sql`lower(${table.email})`),
}));

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('refresh_tokens_user_idx').on(table.userId),
}));

// ---------- exercises ----------
// Each user has their own exercise list (seeded with 13 defaults on registration,
// and extendable through the UI).

export const exercises = pgTable('exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  equipment: equipmentEnum('equipment').notNull(),
  category: muscleCategoryEnum('category').notNull(),
  repRangeMin: smallint('rep_range_min').notNull(),
  repRangeMax: smallint('rep_range_max').notNull(),
  // Weight increment applied to ONE side/unit (e.g. one side of the barbell,
  // or one dumbbell) when the user hits the top of the rep range.
  weightStepKg: numeric('weight_step_kg', { precision: 5, scale: 2 }).notNull().default('0.5'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('exercises_user_idx').on(table.userId),
}));

// ---------- programs ----------
// A named, reusable routine (e.g. "Програма А") the user authors up front -
// picks exercises + starting weights - so a first workout can be started
// from it without needing any prior workout history (unlike
// workouts.programLabel, which only derives a template from a past workout).

export const programs = pgTable('programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('programs_user_idx').on(table.userId),
}));

export const programExercises = pgTable('program_exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
  exerciseId: uuid('exercise_id').notNull().references(() => exercises.id, { onDelete: 'restrict' }),
  weightPerUnitKg: numeric('weight_per_unit_kg', { precision: 6, scale: 2 }),
  weightUnits: smallint('weight_units').default(2),
  orderIndex: smallint('order_index').notNull().default(0),
}, (table) => ({
  programIdx: index('program_exercises_program_idx').on(table.programId),
}));

// ---------- workouts ----------

export const workouts = pgTable('workouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  timeStart: timestamp('time_start', { withTimezone: true }),
  timeEnd: timestamp('time_end', { withTimezone: true }),
  // Free-text label the user assigns to a workout (e.g. "А" / "Б" for an
  // alternating split) so a future workout can be started "from" the latest
  // one with the same label, instead of re-adding every exercise by hand.
  programLabel: text('program_label'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userDateIdx: index('workouts_user_date_idx').on(table.userId, table.date),
  userLabelIdx: index('workouts_user_label_idx').on(table.userId, table.programLabel),
}));

// One row per exercise performed within a workout. The working weight is
// fixed for the whole exercise block (confirmed: it never changes between
// sets), so it lives here rather than on each individual set.
export const workoutExercises = pgTable('workout_exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  workoutId: uuid('workout_id').notNull().references(() => workouts.id, { onDelete: 'cascade' }),
  exerciseId: uuid('exercise_id').notNull().references(() => exercises.id, { onDelete: 'restrict' }),
  // Weight per single unit (one dumbbell, or plates on one side of the bar).
  // Null when the exercise is done with bodyweight only.
  weightPerUnitKg: numeric('weight_per_unit_kg', { precision: 6, scale: 2 }),
  // How many units the weight applies to - normally 2 (both dumbbells / both
  // sides of the bar). Null when weightPerUnitKg is null.
  weightUnits: smallint('weight_units').default(2),
  orderIndex: smallint('order_index').notNull().default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  workoutIdx: index('workout_exercises_workout_idx').on(table.workoutId),
  exerciseIdx: index('workout_exercises_exercise_idx').on(table.exerciseId),
}));

export const sets = pgTable('sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  workoutExerciseId: uuid('workout_exercise_id').notNull().references(() => workoutExercises.id, { onDelete: 'cascade' }),
  setNumber: smallint('set_number').notNull(),
  reps: smallint('reps').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  workoutExerciseIdx: index('sets_workout_exercise_idx').on(table.workoutExerciseId),
  uniqueSetNumber: uniqueIndex('sets_workout_exercise_set_number_idx').on(table.workoutExerciseId, table.setNumber),
}));

// ---------- relations (for query API convenience) ----------

export const usersRelations = relations(users, ({ many }) => ({
  exercises: many(exercises),
  workouts: many(workouts),
  refreshTokens: many(refreshTokens),
  programs: many(programs),
}));

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  user: one(users, { fields: [exercises.userId], references: [users.id] }),
  workoutExercises: many(workoutExercises),
  programExercises: many(programExercises),
}));

export const programsRelations = relations(programs, ({ one, many }) => ({
  user: one(users, { fields: [programs.userId], references: [users.id] }),
  programExercises: many(programExercises),
}));

export const programExercisesRelations = relations(programExercises, ({ one }) => ({
  program: one(programs, { fields: [programExercises.programId], references: [programs.id] }),
  exercise: one(exercises, { fields: [programExercises.exerciseId], references: [exercises.id] }),
}));

export const workoutsRelations = relations(workouts, ({ one, many }) => ({
  user: one(users, { fields: [workouts.userId], references: [users.id] }),
  workoutExercises: many(workoutExercises),
}));

export const workoutExercisesRelations = relations(workoutExercises, ({ one, many }) => ({
  workout: one(workouts, { fields: [workoutExercises.workoutId], references: [workouts.id] }),
  exercise: one(exercises, { fields: [workoutExercises.exerciseId], references: [exercises.id] }),
  sets: many(sets),
}));

export const setsRelations = relations(sets, ({ one }) => ({
  workoutExercise: one(workoutExercises, { fields: [sets.workoutExerciseId], references: [workoutExercises.id] }),
}));
