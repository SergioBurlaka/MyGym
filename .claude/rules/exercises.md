---
paths:
  - "backend/src/modules/exercises/**"
  - "backend/test/exercise-load.test.ts"
  - "frontend/src/pages/ExercisesPage.tsx"
  - "frontend/src/shared/api/exercises/**"
  - "frontend/src/components/EquipmentIcon.tsx"
---

# Вправи (`exercises`)

- Кожен користувач має свій список; при реєстрації сідиться 13 вправами, свої додаються через UI.
- Назва унікальна на користувача **разом з архівними** (без регістру й крайових пробілів):
  створення з назвою архівної вправи її **відновлює** (той самий id та історія, нові параметри;
  ручний зсув лічильника `tryMore*` лишається — оживе, якщо прогресу після архівації не було, як
  і для вправи, прибраної з програм), з назвою активної → 409 `exercise_name_taken`; PATCH, що
  робить `repRangeMin > repRangeMax`, → 400 `rep_range_invalid`.
- `tryMoreCounterAdjust` (smallint, default 0) + `tryMoreCounterAnchor` (date, nullable) — ручний
  зсув лічильника «тренувань без прогресу» (див. "Правила нагадування" у `.claude/rules/progression.md`).
- `unilateral` (bool) — ліва й права окремо, повторення пишуться **на одну сторону**; `limb`
  (`arm`/`leg`, лише при `unilateral`, CHECK) — для підписів «на руку / на ногу»; `defaultBarKg`
  (0–50, лише `barbell`, CHECK; сід і нові штанги — 20, `DEFAULT_BAR_KG`) — гриф за замовчуванням
  (міграція 0026, див. "Модель навантаження" у `.claude/rules/progression.md`).
