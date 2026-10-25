-- Data-only backfill (UX audit 2026-10-25, finding 01). Before the auto-finish
-- sweep existed (0020), a workout left open was closed whenever someone
-- pressed "Finish" - sometimes days later - so it showed e.g. "53 h 16 min".
-- The sweep only touches open workouts, so it never fixes those. Apply the
-- same rule and threshold as AUTO_FINISH_AFTER_MINUTES (90) in autoFinish.ts:
-- more than 90 min of silence after the last save -> the session ended at
-- that save. CSV-imported workouts (no time_start) are left alone.
UPDATE workouts w
SET time_end = activity.last_at, auto_finished = true
FROM (
  SELECT w2.id, GREATEST(w2.time_start, MAX(s.created_at)) AS last_at
  FROM workouts w2
  LEFT JOIN workout_exercises we ON we.workout_id = w2.id
  LEFT JOIN sets s ON s.workout_exercise_id = we.id
  WHERE w2.time_start IS NOT NULL AND w2.time_end IS NOT NULL AND NOT w2.auto_finished
  GROUP BY w2.id
) AS activity
WHERE w.id = activity.id
  AND w.time_end > activity.last_at + interval '90 minutes';
