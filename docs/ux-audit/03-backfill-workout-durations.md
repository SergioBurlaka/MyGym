# 03 · Старі тренування з роздутою тривалістю

Гілка: `fix/backfill-workout-durations`. Знахідка аудиту 01 (критично).

## Що зараз

Тренування 21.10.2026 у журналі й на своїй сторінці: «Finished · 53 h 16 min».

```
GET /api/workouts/3ba9daf8-a503-4c9a-b988-1a238c09a835
timeStart: 2026-10-21T07:35:57Z
sets[*].createdAt: 2026-10-21T08:59:52Z   ← остання активність
timeEnd:   2026-10-23T12:51:28Z            ← закрито через 2 дні
autoFinished: false
```

`autoFinish.ts` (з 2026-10-24) закриває лише тренування з `time_end IS NULL`. Це вже було
закрите `finishWorkout` пізніше (`time_end = now()`), тож sweep його не чіпає й не виправить.
Скільки ще таких записів у проді — невідомо, перевірити запитом нижче.

## Що зробити

1. **Оцінка (read-only, спершу показати користувачу результат):**
   ```sql
   SELECT w.id, w.date, w.time_start, w.time_end,
          GREATEST(w.time_start, MAX(s.created_at)) AS last_at
   FROM workouts w
   LEFT JOIN workout_exercises we ON we.workout_id = w.id
   LEFT JOIN sets s ON s.workout_exercise_id = we.id
   WHERE w.time_start IS NOT NULL AND w.time_end IS NOT NULL AND NOT w.auto_finished
   GROUP BY w.id
   HAVING w.time_end - GREATEST(w.time_start, MAX(s.created_at)) > interval '90 minutes';
   ```
2. **Міграція даних** `backend/migrations/0023_backfill_stale_durations.sql`: той самий
   відбір → `time_end = last_at`, `auto_finished = true`. Те саме правило й поріг, що в
   `AUTO_FINISH_AFTER_MINUTES` (90 хв) — без нового правила.
3. **Нові записи вже захищені:** sweep кожні 5 хв закриває тренування раніше, ніж
   запізнілий `finishWorkout` встигне поставити `now()`, а для закритого `finishWorkout`
   нічого не змінює (~рядок 238). Код не чіпати; лише переконатись тестом, що
   `finishWorkout` після sweep не рухає `time_end` (якщо такого тесту ще нема).
4. **UI-запобіжник:** у `formatDuration` (`utils/weight.ts`) або місцях виклику
   (`DashboardPage.tsx` ~112, `WorkoutFormPage.tsx` ~263) тривалість > 4 год показувати
   з позначкою «не завершено вчасно», а не голими годинами.

## Перевірка

- Після міграції тренування 21.10 показує ~1 год 24 хв і позначку автозавершення.
- Тести бекенду зелені; новий тест на `finishWorkout` після довгої паузи.
- Оновити розділ «Автозавершення тренування» в CLAUDE.md.
