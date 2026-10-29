-- One-off fix of the owner's exercises for the load model (migration 0026),
-- agreed with the user 2026-10-29. Run ONCE on prod, AFTER the deploy that
-- applies 0026 (the columns must exist):
--
--   docker compose exec -T postgres psql -U mygym -d mygym < scripts/data-fixes/2026-10-29-load-model-owner.sql
--
-- Ids are the owner's rows on prod; on any other database it changes nothing.
-- Not a migration on purpose: other users' exercises with the same names are
-- left as they are.

BEGIN;

-- Жим стоячи: a 15 kg bar, today and in the history (0026 put 20).
UPDATE exercises SET default_bar_kg = 15
WHERE id = '6c290e01-1cf2-4d63-913b-b64341ea79b2' AND user_id = '5f30d399-dc10-41b2-9573-daaed551579c';
UPDATE workout_exercises SET bar_kg = 15
WHERE exercise_id = '6c290e01-1cf2-4d63-913b-b64341ea79b2' AND weight_per_unit_kg IS NOT NULL;

-- Випади: two dumbbells, each leg in turn - reps are per leg.
UPDATE exercises SET unilateral = true, limb = 'leg'
WHERE id = '1399fcfc-7899-4308-9561-c5b974f056c8' AND user_id = '5f30d399-dc10-41b2-9573-daaed551579c';

-- Французький жим сидячи: one dumbbell, each arm in turn - so ONE dumbbell
-- moves per rep; the history logged it as 2.
UPDATE exercises SET unilateral = true, limb = 'arm'
WHERE id = '371e6802-38af-4d0f-bf7c-ba343ca172ca' AND user_id = '5f30d399-dc10-41b2-9573-daaed551579c';
UPDATE workout_exercises SET weight_units = 1
WHERE exercise_id = '371e6802-38af-4d0f-bf7c-ba343ca172ca' AND weight_units = 2;

COMMIT;
