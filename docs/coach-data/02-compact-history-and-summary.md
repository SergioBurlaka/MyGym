# Завдання 2: Фільтр дат, компактна історія і `get_training_summary`

## Мета
Тренер читає історію за будь-який період одним викликом, без переповнення
контексту. Новий зведений інструмент `get_training_summary` стає першим
кроком будь-якого аналізу.

## Навіщо
`list_recent_workouts` на 20 тренувань повернув ~160 КБ (~40 тис. токенів):
кожна вправа кожного тренування несе повний об'єкт `exercise`. Claude обрізає
відповідь MCP на ~25 тис. токенів і зберігає її у файл — тренер фактично не
може прочитати історію.

## Контекст у репо
- `GET /api/workouts?page=&pageSize=` → `{ data, total, page, pageSize,
  totalPages }` з повністю вкладеними `workoutExercises[].exercise` і `sets`.
  Використовує журнал (`useWorkoutsQuery`, `Pagination.tsx`) — **не ламати**.
- `GET /api/workouts/dates?from&to` — легкий ендпоінт для календаря (приклад
  того, як робити).
- `mcp-server/src/tools/workouts.ts` — `list_recent_workouts(limit, page)`.
- `users.timezone` — IANA-пояс користувача (для меж днів/тижнів).

## Що зробити

### Бекенд
1. `GET /api/workouts`: додати опційні `from`, `to` (YYYY-MM-DD, обидві
   включно, у поясі користувача) і `view=full|compact|summary` (default `full`
   — журнал не змінюється). Валідація Zod, невалідні дати → 400.
2. `view=compact`: вправи як `{ e: <коротке посилання>, name, w: totalKg | null,
   sets: [[reps, rir], …] }` без вкладеного `exercise`; словник вправ
   (`id → name, category, repRange`) один раз на відповідь.
3. `view=summary`: на тренування — дата, мітка програми, тривалість, кількість
   робочих підходів, по вправі один рядок (`"Присідання 20×2: 9/9/8/8"`).
4. Новий модуль `modules/coach/` (або `summary/`): `GET /api/coach/summary?from&to`
   — на старті повертає `{ range, sessions: [<рядок на сесію>], flags: [] }`.
   Завдання 5–8 і 10 додадуть сюди `weekly`, `adherence`, `readinessLast`,
   `activePain`. Рядок сесії: `"2026-10-21 Б 67хв | Присідання 4×9/9/8/8 @20×2 RIR 2/1/1/0 | …"`.
   Запобіжник: якщо відповідь > ~20 тис. символів — коротший формат і
   `"truncated": true` + `"hint": "narrow the range"`.
5. Юніт-тести на форматування рядків (чисті функції).

### MCP
6. `list_recent_workouts`: нові параметри `from`, `to`, `responseFormat:
   'concise' | 'detailed'` (default `concise` → `view=summary`). `readOnlyHint: true`.
7. Новий `get_training_summary(from?, to?)` (default — останні 28 днів).
   Опис: «Start any analysis of training, progress, volume, missed sessions or
   readiness here; call get_workout only for one session's details.»
8. Тест у `mcp-server/test/`: розмір відповіді `concise` за 20 тренувань
   < 15 КБ на фейкових даних.

### Фронтенд (опційно в цьому завданні)
9. Над журналом — фільтр «7 днів · 30 днів · 3 місяці · Період…» (через ті
   самі `from`/`to`), рядок підсумку «12 тренувань · 186 робочих підходів · 14,2 год».
   Пагінація номерами сторінок лишається.

## Обмеження
- Курсорну пагінацію не впроваджувати: журнал на `page/pageSize`, для MCP
  досить діапазону дат.
- `view=full` поводиться побайтово так само, як зараз.

## Критерії готовності
- Тести бекенду: фільтр дат (межі включно, пояс), три `view`, порожній діапазон.
- Реальна перевірка: `get_training_summary` за 4 тижні — до ~1,5 тис. токенів.
- CLAUDE.md: нові параметри `/api/workouts`, модуль coach, MCP-інструменти.
