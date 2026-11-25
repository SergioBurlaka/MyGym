-- Bodyweight exercises in existing programs: keep the added weight they would
-- have started with before the program became its source - the last logged
-- one (with sets) of the program owner, same order as findLatestWorkoutExercises.
UPDATE "program_exercises" AS pe
SET "extra_weight_kg" = latest.weight
FROM (
  SELECT DISTINCT ON (p."id") p."id" AS pe_id, we."weight_per_unit_kg" AS weight
  FROM "program_exercises" p
  JOIN "programs" pr ON pr."id" = p."program_id"
  JOIN "exercises" e ON e."id" = p."exercise_id" AND e."equipment" = 'bodyweight'
  JOIN "workout_exercises" we ON we."exercise_id" = p."exercise_id"
  JOIN "workouts" w ON w."id" = we."workout_id" AND w."user_id" = pr."user_id"
  WHERE EXISTS (SELECT 1 FROM "sets" s WHERE s."workout_exercise_id" = we."id")
  ORDER BY p."id", w."date" DESC, w."created_at" DESC, we."order_index" DESC, we."id" DESC
) AS latest
WHERE pe."id" = latest.pe_id AND latest.weight > 0;
