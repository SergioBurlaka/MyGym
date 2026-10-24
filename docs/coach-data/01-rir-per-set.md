# Завдання 1: RIR і тип підходу на кожен підхід

## Мета
Записувати на кожен підхід, скільки повторів лишалось у запасі (RIR), і тип
підходу (розминка / робочий / дроп-сет / до відмови). Тренер має відрізняти
«9 легко» від «9 через силу».

## Навіщо
Без RIR правило прогресії «вагу не підвищувати, якщо підхід пішов у відмову»
неможливе, а тренер вгадує. Тип підходу потрібен, щоб розминка не рахувалась
в обсязі (завдання 5).

## Контекст у репо
- `backend/src/db/schema.ts` — `sets` має лише `setNumber`, `reps`, `createdAt`.
  Вага живе на `workout_exercises` (одна на всю вправу — так і лишається).
- `backend/src/modules/workouts/` — `PUT /api/workouts/:id/exercises`
  (`saveWorkoutExercises`) **перезаписує всі вправи й підходи** (delete + insert).
  На ньому стоїть автозбереження `WorkoutFormPage.tsx` (див. CLAUDE.md,
  «Автозбереження тренування»). Тобто RIR має проходити через цей самий PUT,
  інакше автозбереження його зітре.
- `mcp-server/src/tools/workouts.ts` — `log_workout_exercises` дзеркалить PUT.
- `progression.service.ts` — `suggestProgression` (чисті функції, юніт-тести).
- `programs`/`program_exercises` — `targetSets`; цільового RIR немає.

## Що зробити

### БД
1. `sets`: `rir smallint null` (CHECK 0–5; 5 = «5+»), `rir_source text null`
   (`'user' | 'prefill'`), `set_type text not null default 'normal'`
   (CHECK `warmup | normal | dropset | failure`).
2. `program_exercises`: `rir_target smallint null` (0–5). Дефолт у UI: 2 для
   `large`, 1 для `small`, null для `bodyweight`.

### Бекенд
3. `saveWorkoutExercisesSchema`: у підходах опційні `rir`, `rirSource`, `setType`.
   Старий клієнт без цих полів працює як раніше (null / `normal`).
4. `getWorkout`, `listWorkouts`, history-ендпоінти повертають нові поля.
5. `startWorkout` з `programId`: підставити `rir_target` вправи програми як
   підказку (на фронті — контурний чип), **але не записувати як `rir`**.
6. Прогресія (`suggestProgression`): якщо в останній сесії є підхід з `rir = 0`
   або `set_type = 'failure'` на робочому підході, а цільовий RIR > 0 — не
   пропонувати `increase_weight`, навіть якщо повтори на верхній межі. Розминку
   (`warmup`) ігнорувати в усіх розрахунках прогресії. Юніт-тести.

### MCP — рішення, яке треба прийняти (дочекатися вибору користувача)
7. Варіанти:
   - **A (мінімум):** лишити `log_workout_exercises` як є, лише додати в схему
     підходу `rir`, `setType`. Ризик лишається: повтор виклику з неповним
     списком стирає вправи.
   - **B (рекомендовано дослідженням):** новий бекенд-ендпоінт
     `POST /api/workouts/:id/sets` (додає підходи до вправи, створює
     `workout_exercise`, якщо її ще нема; ідемпотентний за `idempotencyKey`) і
     `PATCH /api/workouts/:id/sets/:setId` (змінити reps/rir одного підходу).
     MCP: `log_sets` (`destructiveHint: false`, `idempotentHint: true`) і
     `update_set`. `log_workout_exercises` лишається для повної заміни з
     описом «REPLACES ALL». Автозбереження вебу не змінюється.
   Пояснити компроміси (обсяг роботи, ризик втрати даних) і чекати рішення.
8. Опис для Claude в інструментах: «rir: reps in reserve after the set, 0 = to
   failure, 5 = 5 or more; null = not rated; rirSource=prefill = user did not
   change the suggestion; setType=warmup sets are not working sets».

### Фронтенд
9. Рядок чипів RIR під/у рядку підходу на `WorkoutFormPage` (див. `RESEARCH.md`,
   пункт 1): `0 · 1 · 2 · 3 · 4 · 5+`, кожен ≥48 px, `role="radiogroup"`.
   Заголовок «RIR — скільки ще повторів зміг би?», підпис лише під вибраним
   («Відмова — жодного чистого повтору більше» / «Ще один, і все» / «Ще два» /
   «Ще три» / «Ще чотири» / «Легко, запас великий»), іконка (i) з поясненням.
   Ціль із програми — контурний чип «Ціль: 1–2». Вибір дотиком = `rirSource: 'user'`.
10. Перемикач типу підходу «Розминка / Робочий / Дроп-сет / До відмови»
    (компактно, напр. довге натискання на номер підходу або меню). Для розминки
    чипи RIR приховані.
11. Поле **необов'язкове** і не блокує збереження. Зміна RIR — звичайна правка
    для автозбереження (як reps).
12. У формі програми (`ProgramsPage.tsx`) — поле «Цільовий RIR» на вправу.
13. en/uk тексти.

## Обмеження
- Половинні значення RIR не робити (v1).
- RIR лишається null для всіх старих підходів — жодних бекфілів «на око».

## Критерії готовності
- Тести: збереження/читання rir через PUT; старий payload без rir працює;
  прогресія не радить вагу після відмови; розминка не впливає на прогресію;
  (варіант B) повторний `log_sets` з тим самим ключем не дублює.
- `mcp-server` тест: rir доходить до бекенду.
- CLAUDE.md: нові поля `sets`, правило відмови в прогресії, рішення щодо MCP-запису.
