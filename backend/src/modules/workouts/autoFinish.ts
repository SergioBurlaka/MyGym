import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/client.js';

// A workout nobody pressed "Finish" on is closed after this long without
// activity (user's decision, 2026-10-24). Once closed it stays closed: a
// later save doesn't reopen it or move timeEnd - 1.5 h of silence means the
// session is over, and a later edit is a correction.
export const AUTO_FINISH_AFTER_MINUTES = 90;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// Closes every open workout whose last activity is AUTO_FINISH_AFTER_MINUTES
// or more before `now`, for all users at once. Last activity = the latest
// save: PUT /workouts/:id/exercises rewrites every set, so the newest
// sets.created_at is the moment of the last save; no sets yet -> the start.
// timeEnd becomes that moment, not "now", so the duration stays honest.
// Workouts without a timeStart (CSV-imported) are left alone - there is no
// session to time. Returns how many were closed.
export async function autoFinishStaleWorkouts(now: Date = new Date()): Promise<number> {
  const result = await db.execute(sql`
    UPDATE workouts w
    SET time_end = activity.last_at, auto_finished = true
    FROM (
      SELECT w2.id, GREATEST(w2.time_start, MAX(s.created_at)) AS last_at
      FROM workouts w2
      LEFT JOIN workout_exercises we ON we.workout_id = w2.id
      LEFT JOIN sets s ON s.workout_exercise_id = we.id
      WHERE w2.time_end IS NULL AND w2.time_start IS NOT NULL
      GROUP BY w2.id
    ) AS activity
    WHERE w.id = activity.id
      AND w.time_end IS NULL
      AND activity.last_at <= ${now.toISOString()}::timestamptz - make_interval(mins => ${AUTO_FINISH_AFTER_MINUTES})
  `);
  return result.rowCount ?? 0;
}

// Runs the sweep at startup and every few minutes while the server is up.
// Errors are logged, never thrown - a failed sweep just retries next tick.
export function startAutoFinishSweep(app: FastifyInstance) {
  const run = async () => {
    try {
      const closed = await autoFinishStaleWorkouts();
      if (closed > 0) app.log.info({ closed }, 'auto-finished stale workouts');
    } catch (err) {
      app.log.error({ err }, 'auto-finish sweep failed');
    }
  };
  void run();
  const timer = setInterval(run, SWEEP_INTERVAL_MS);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
}
