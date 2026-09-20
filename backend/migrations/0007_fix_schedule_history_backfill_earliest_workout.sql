-- The 0006 backfill assumed the current schedule applied since the user's
-- registration date (users.created_at). That's wrong for accounts whose
-- workout history was brought in via CSV import with real historical
-- dates predating the account row itself - those dates ended up before
-- the earliest schedule-history entry, so the consistency calendar
-- couldn't tell if they were planned (no applicable schedule = always
-- "rest"/"bonus", never "missed" or "planned"). Pull each user's earliest
-- history row back to their earliest workout date, if that's earlier.
-- Only touches the single earliest row per user - later legitimate
-- schedule-change rows are untouched.
UPDATE "training_schedule_history" h
SET "effective_from" = sub.earliest_date
FROM (
  SELECT h2."id" AS id, LEAST(h2."effective_from", COALESCE(MIN(w."date"), h2."effective_from")) AS earliest_date
  FROM "training_schedule_history" h2
  LEFT JOIN "workouts" w ON w."user_id" = h2."user_id"
  WHERE h2."effective_from" = (
    SELECT MIN(h3."effective_from") FROM "training_schedule_history" h3 WHERE h3."user_id" = h2."user_id"
  )
  GROUP BY h2."id", h2."effective_from"
) sub
WHERE h."id" = sub.id AND sub.earliest_date < h."effective_from";
