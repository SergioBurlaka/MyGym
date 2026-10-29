-- One-off fix: the owner weighed his bar - 8 kg, the same bar for every
-- barbell exercise (agreed with the user 2026-10-29). Replaces the 20 kg
-- that migration 0026 put in and the 15 kg of 2026-10-29-load-model-owner.sql
-- for Жим стоячи. Run ONCE on prod:
--
--   docker compose exec -T postgres psql -U mygym -d mygym < scripts/data-fixes/2026-10-29-owner-bar-8kg.sql
--
-- Scoped to the owner's user_id; other users keep the 20 kg default.

BEGIN;

UPDATE exercises SET default_bar_kg = 8
WHERE user_id = '5f30d399-dc10-41b2-9573-daaed551579c' AND equipment = 'barbell';

UPDATE workout_exercises we SET bar_kg = 8
FROM exercises e
WHERE e.id = we.exercise_id
  AND e.user_id = '5f30d399-dc10-41b2-9573-daaed551579c'
  AND e.equipment = 'barbell'
  AND we.weight_per_unit_kg IS NOT NULL;

COMMIT;
