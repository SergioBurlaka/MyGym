import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  smallint,
  integer,
  numeric,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
  boolean,
  check,
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
  // null for accounts created through "Sign in with Google" - they have no
  // password until (some future) "set password" feature.
  passwordHash: text('password_hash'),
  // Google's stable account id (`sub` of the ID token). Set on the first
  // Google sign-in, either for a new account or linked to an existing one
  // with the same (Google-verified) email.
  googleSub: text('google_sub'),
  // ISO weekday numbers (1=Mon..7=Sun) the user plans to train on. Drives the
  // consistency calendar's "missed a planned day" detection.
  trainingDays: jsonb('training_days').$type<number[]>().notNull().default([1, 3, 5]),
  // When a planned workout starts ("HH:MM", local to `timezone`) and how long
  // it lasts - only used to place events in the calendar feed.
  trainingTime: text('training_time').notNull().default('18:00'),
  trainingDurationMin: smallint('training_duration_min').notNull().default(60),
  // IANA zone, so recurring calendar events keep their local time across DST.
  timezone: text('timezone').notNull().default('Europe/Kyiv'),
  // SHA-256 of the secret calendar feed token ("mygym_cal_..."); null = no
  // calendar connected. One feed per user: regenerating replaces the hash.
  calendarFeedTokenHash: text('calendar_feed_token_hash'),
  calendarFeedCreatedAt: timestamp('calendar_feed_created_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(sql`lower(${table.email})`),
  googleSubIdx: uniqueIndex('users_google_sub_idx').on(table.googleSub),
  calendarFeedTokenIdx: uniqueIndex('users_calendar_feed_token_idx').on(table.calendarFeedTokenHash),
  // Mirrors the settings Zod schema; the DB checks too so data coming in some
  // other way (MCP, import, manual SQL) can't break the invariants.
  trainingDurationCheck: check('users_training_duration_min_check', sql`${table.trainingDurationMin} BETWEEN 15 AND 300`),
}));

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Every refresh looks the token up by hash.
  tokenHashIdx: uniqueIndex('refresh_tokens_token_hash_idx').on(table.tokenHash),
  userIdx: index('refresh_tokens_user_idx').on(table.userId),
}));

// Personal access tokens ("mygym_pat_...") for programs acting on a user's
// behalf - the MCP server, Claude Code. Long-lived until revoked; like
// refresh tokens only a SHA-256 hash is stored, the raw token is shown once.
export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // e.g. "Claude Code"
  tokenHash: text('token_hash').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  // Set only for OAuth access tokens ("mygym_oat_..."): short-lived and
  // owned by an OAuth grant. Personal access tokens have neither.
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  grantId: uuid('grant_id').references(() => oauthGrants.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Every PAT request looks the token up by hash.
  tokenHashIdx: uniqueIndex('api_tokens_token_hash_idx').on(table.tokenHash),
  userIdx: index('api_tokens_user_idx').on(table.userId),
  grantIdx: index('api_tokens_grant_idx').on(table.grantId),
  // Either a PAT (no grant, no expiry) or an OAuth access token (both).
  kindCheck: check('api_tokens_kind_check', sql`(${table.grantId} IS NULL) = (${table.expiresAt} IS NULL)`),
}));

// ---------- OAuth (MCP clients signing in: Claude, ChatGPT) ----------
// MyGym is the authorization server. Claude and ChatGPT identify themselves
// with a Client ID Metadata Document URL (CIMD) and need no row here; other
// clients (Gemini, ...) register themselves via DCR into oauth_clients.

// A dynamically registered client (RFC 7591). Registration is open, so the
// consent screen marks these as unverified; rows nobody connected expire.
export const oauthClients = pgTable('oauth_clients', {
  id: text('id').primaryKey(), // the client_id, mygym_cli_<32 hex>
  // sha256 of the secret; null for public clients (PKCE only).
  clientSecretHash: text('client_secret_hash'),
  // none | client_secret_post | client_secret_basic
  tokenEndpointAuthMethod: text('token_endpoint_auth_method').notNull(),
  clientName: text('client_name').notNull(),
  clientUri: text('client_uri'),
  redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// One pending "may <client> access your data?" request, from /authorize
// until the code is exchanged. Short-lived; only hashes of the code.
export const oauthAuthorizationRequests = pgTable('oauth_authorization_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: text('client_id').notNull(), // the CIMD URL
  clientName: text('client_name').notNull(),
  clientLogoUri: text('client_logo_uri'), // https only, from the metadata document
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(), // PKCE S256
  state: text('state'),
  resource: text('resource').notNull(),
  scope: text('scope').notNull(),
  // sha256 of the browser cookie set by /authorize: only the browser that
  // started the request may see or answer its consent page.
  browserHash: text('browser_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  // Filled in when the user approves.
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash'),
  codeExpiresAt: timestamp('code_expires_at', { withTimezone: true }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  codeHashIdx: uniqueIndex('oauth_authorization_requests_code_hash_idx').on(table.codeHash),
}));

// One connection of a user to a client ("Claude", "ChatGPT") - what the
// Integrations page lists and revokes. Its access tokens live in api_tokens.
export const oauthGrants = pgTable('oauth_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  clientName: text('client_name').notNull(),
  clientLogoUri: text('client_logo_uri'),
  resource: text('resource').notNull(),
  scope: text('scope').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('oauth_grants_user_idx').on(table.userId),
}));

// Rotating refresh tokens of a grant. A used one is kept (usedAt) so that
// presenting it again is recognised as theft and revokes the whole grant.
export const oauthRefreshTokens = pgTable('oauth_refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  grantId: uuid('grant_id').notNull().references(() => oauthGrants.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashIdx: uniqueIndex('oauth_refresh_tokens_token_hash_idx').on(table.tokenHash),
  grantIdx: index('oauth_refresh_tokens_grant_idx').on(table.grantId),
}));

// One row per day the training schedule actually changed - lets the
// consistency calendar judge each past date against the schedule that was
// really in effect THEN, instead of retroactively re-judging history every
// time the user edits users.trainingDays (the current/"today" value).
// `effectiveFrom` is inclusive; the schedule effective on a given date is
// the row with the latest effectiveFrom <= that date. Unique per
// (userId, effectiveFrom) - multiple edits on the same day overwrite that
// day's row rather than stacking.
export const trainingScheduleHistory = pgTable('training_schedule_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  trainingDays: jsonb('training_days').$type<number[]>().notNull(),
  effectiveFrom: date('effective_from').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('training_schedule_history_user_idx').on(table.userId),
  userEffectiveFromIdx: uniqueIndex('training_schedule_history_user_effective_from_idx').on(
    table.userId,
    table.effectiveFrom,
  ),
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
  // Manual shift of the "workouts without progress" counter (the try-more
  // slider on the Programs page): added to the counted sessions, but only
  // while the last progress is still the one dated tryMoreCounterAnchor -
  // the next real progress restarts the count and the shift lapses.
  tryMoreCounterAdjust: smallint('try_more_counter_adjust').notNull().default(0),
  tryMoreCounterAnchor: date('try_more_counter_anchor'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('exercises_user_idx').on(table.userId),
  // Archived ones included: CSV import and exercise creation match names
  // case-insensitively across all of a user's exercises.
  userNameIdx: uniqueIndex('exercises_user_name_idx').on(table.userId, sql`lower(btrim(${table.name}))`),
  repRangeCheck: check(
    'exercises_rep_range_check',
    sql`${table.repRangeMin} >= 1 AND ${table.repRangeMax} <= 100 AND ${table.repRangeMin} <= ${table.repRangeMax}`,
  ),
  weightStepCheck: check('exercises_weight_step_check', sql`${table.weightStepKg} BETWEEN 0 AND 50`),
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
  // Rotation order between a user's programs (A, Б, ...) - assigned in
  // creation order, drives getSuggestedProgram()'s "next in the cycle" pick.
  orderIndex: smallint('order_index').notNull().default(0),
  // Workouts of the exercise without progress before the "try_more"
  // reminder, for every exercise in this program (skipped/missed schedule
  // days just don't add to the count). Null keeps the category default
  // (DEFAULT_TRY_MORE_AFTER_WORKOUTS in progression.service.ts).
  tryMoreAfterWorkouts: smallint('try_more_after_workouts'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('programs_user_idx').on(table.userId),
  tryMoreCheck: check('programs_try_more_check', sql`${table.tryMoreAfterWorkouts} BETWEEN 1 AND 60`),
}));

export const programExercises = pgTable('program_exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
  // NO ACTION + DEFERRABLE INITIALLY DEFERRED (set in migration 0019 - drizzle
  // can't express it): deleting an exercise still in use fails at commit,
  // but deleting a user works - its workouts/programs cascade away in the
  // same statement before the check runs. RESTRICT can't be deferred. If
  // drizzle-kit ever regenerates this FK, re-add the DEFERRABLE clause.
  exerciseId: uuid('exercise_id').notNull().references(() => exercises.id, { onDelete: 'no action' }),
  // Target number of sets for this exercise within the program - lets the
  // user see the planned volume at a glance. Weight is intentionally NOT
  // stored here: a new workout started from a program pulls the working
  // weight (and rep counts) from the most recent time each exercise was
  // actually performed, not a stale "starting weight" set once up front.
  targetSets: smallint('target_sets').notNull().default(3),
  // Per-exercise override of programs.tryMoreAfterWorkouts (same meaning:
  // workouts of this exercise without progress before "try_more"). Null
  // falls back to the program's value, then to the category default
  // (DEFAULT_TRY_MORE_AFTER_WORKOUTS in progression.service.ts).
  tryMoreAfterWorkouts: smallint('try_more_after_workouts'),
  orderIndex: smallint('order_index').notNull().default(0),
}, (table) => ({
  programIdx: index('program_exercises_program_idx').on(table.programId),
  // The program form keys rows by exerciseId - a duplicate would break it.
  programExerciseIdx: uniqueIndex('program_exercises_program_exercise_idx').on(table.programId, table.exerciseId),
  // FK lookups when an exercise is deleted, and the threshold joins.
  exerciseIdx: index('program_exercises_exercise_idx').on(table.exerciseId),
  targetSetsCheck: check('program_exercises_target_sets_check', sql`${table.targetSets} BETWEEN 1 AND 20`),
  tryMoreCheck: check('program_exercises_try_more_check', sql`${table.tryMoreAfterWorkouts} BETWEEN 1 AND 60`),
}));

// ---------- workouts ----------

export const workouts = pgTable('workouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  timeStart: timestamp('time_start', { withTimezone: true }),
  timeEnd: timestamp('time_end', { withTimezone: true }),
  // True when timeEnd was set by autoFinishStaleWorkouts (the user never
  // pressed "Finish") rather than by the user.
  autoFinished: boolean('auto_finished').notNull().default(false),
  // Header-timer pause. pausedMs = time already spent paused (closed pauses),
  // pausedAt = start of the pause in progress (null = running), resumedAt =
  // the last resume. Duration = timeEnd - timeStart - pausedMs; pausing and
  // resuming also count as activity for the auto-finish sweep.
  pausedMs: integer('paused_ms').notNull().default(0),
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  resumedAt: timestamp('resumed_at', { withTimezone: true }),
  // Free-text label the user assigns to a workout (e.g. "А" / "Б" for an
  // alternating split) so a future workout can be started "from" the latest
  // one with the same label, instead of re-adding every exercise by hand.
  programLabel: text('program_label'),
  // Set when this workout was started from an authored Program (see below);
  // null for "Довільне тренування" and for legacy copyFromWorkoutId starts.
  // set null on delete - deleting a Program never touches the workouts
  // already logged under it, it just drops the association.
  programId: uuid('program_id').references(() => programs.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userDateIdx: index('workouts_user_date_idx').on(table.userId, table.date),
  userLabelIdx: index('workouts_user_label_idx').on(table.userId, table.programLabel),
  pausedMsCheck: check('workouts_paused_ms_check', sql`${table.pausedMs} >= 0`),
  // A finished workout has no pause in progress - finishing folds it into pausedMs.
  pausedOpenCheck: check('workouts_paused_open_check', sql`${table.pausedAt} IS NULL OR ${table.timeEnd} IS NULL`),
}));

// One row per exercise performed within a workout. The working weight is
// fixed for the whole exercise block (confirmed: it never changes between
// sets), so it lives here rather than on each individual set.
export const workoutExercises = pgTable('workout_exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  workoutId: uuid('workout_id').notNull().references(() => workouts.id, { onDelete: 'cascade' }),
  // NO ACTION + DEFERRABLE INITIALLY DEFERRED (set in migration 0019 - drizzle
  // can't express it): deleting an exercise still in use fails at commit,
  // but deleting a user works - its workouts/programs cascade away in the
  // same statement before the check runs. RESTRICT can't be deferred. If
  // drizzle-kit ever regenerates this FK, re-add the DEFERRABLE clause.
  exerciseId: uuid('exercise_id').notNull().references(() => exercises.id, { onDelete: 'no action' }),
  // Weight per single unit (one dumbbell, or plates on one side of the bar).
  // Null when the exercise is done with bodyweight only.
  weightPerUnitKg: numeric('weight_per_unit_kg', { precision: 6, scale: 2 }),
  // How many units the weight applies to - normally 2 (both dumbbells / both
  // sides of the bar). Null when weightPerUnitKg is null.
  // No default: every insert sets it explicitly (null without weight), and a
  // default of 2 would break the weight_units check for a bodyweight row.
  weightUnits: smallint('weight_units'),
  orderIndex: smallint('order_index').notNull().default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  workoutIdx: index('workout_exercises_workout_idx').on(table.workoutId),
  exerciseIdx: index('workout_exercises_exercise_idx').on(table.exerciseId),
  weightCheck: check('workout_exercises_weight_check', sql`${table.weightPerUnitKg} BETWEEN 0 AND 500`),
  // Units are 1 or 2, and only with a weight. A weight without units is
  // allowed - old rows have it, readers fall back to 2.
  weightUnitsCheck: check(
    'workout_exercises_weight_units_check',
    sql`${table.weightUnits} IS NULL OR (${table.weightUnits} IN (1, 2) AND ${table.weightPerUnitKg} IS NOT NULL)`,
  ),
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
  repsCheck: check('sets_reps_check', sql`${table.reps} BETWEEN 0 AND 200`),
  setNumberCheck: check('sets_set_number_check', sql`${table.setNumber} >= 1`),
}));

// ---------- relations (for query API convenience) ----------

export const usersRelations = relations(users, ({ many }) => ({
  exercises: many(exercises),
  workouts: many(workouts),
  refreshTokens: many(refreshTokens),
  apiTokens: many(apiTokens),
  oauthGrants: many(oauthGrants),
  programs: many(programs),
  trainingScheduleHistory: many(trainingScheduleHistory),
}));

export const oauthGrantsRelations = relations(oauthGrants, ({ one, many }) => ({
  user: one(users, { fields: [oauthGrants.userId], references: [users.id] }),
  refreshTokens: many(oauthRefreshTokens),
}));

export const oauthRefreshTokensRelations = relations(oauthRefreshTokens, ({ one }) => ({
  grant: one(oauthGrants, { fields: [oauthRefreshTokens.grantId], references: [oauthGrants.id] }),
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
  program: one(programs, { fields: [workouts.programId], references: [programs.id] }),
}));

export const workoutExercisesRelations = relations(workoutExercises, ({ one, many }) => ({
  workout: one(workouts, { fields: [workoutExercises.workoutId], references: [workouts.id] }),
  exercise: one(exercises, { fields: [workoutExercises.exerciseId], references: [exercises.id] }),
  sets: many(sets),
}));

export const setsRelations = relations(sets, ({ one }) => ({
  workoutExercise: one(workoutExercises, { fields: [sets.workoutExerciseId], references: [workoutExercises.id] }),
}));
