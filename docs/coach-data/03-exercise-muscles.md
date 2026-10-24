# Завдання 3: Розмітка вправ за м'язами

## Мета
Кожна вправа знає свої основні й допоміжні м'язи — основа для тижневого
обсягу на м'яз (завдання 5).

## Навіщо
Зараз є лише `category` (`large`/`small`/`bodyweight`) — для прогресії, а не
для обсягу. Аналіз 8–21.10 показав, що головна проблема — замалий обсяг на
м'яз (~5–8 підходів при цілі 12–16), але порахувати його можна лише вручну.

## Контекст у репо
- `exercises` (per-user, 13 дефолтних при реєстрації — `createUserWithDefaults`
  в `auth.service.ts`, спільна з Google-входом).
- `GET/POST/PUT /api/exercises` — `modules/exercises/`.
- Форма вправи на сторінці «Вправи» (фронтенд).
- **Назви вправ не перекладаються** (CLAUDE.md, i18n) — назви м'язів перекладаються.

## Що зробити

### БД
1. Довідник `muscle_groups` (`code text pk`, `region text` — push/pull/legs/core,
   `sortOrder`). Назви — в i18n за `code`, не в БД. 17 кодів: `chest, front_delts,
   side_delts, rear_delts, lats, upper_back, traps, biceps, triceps, forearms,
   abs, lower_back, glutes, quads, hamstrings, adductors, calves`. Таблиця, не
   pgEnum — щоб додавати групи без міграції типу. Сідиться міграцією.
2. `exercise_muscles` (`exerciseId uuid → exercises on delete cascade`,
   `muscleCode → muscle_groups`, `role 'primary'|'secondary'`, `weight numeric(3,2)`
   default 1.0 для primary / 0.5 для secondary, PK `(exerciseId, muscleCode)`).

### Бекенд
3. `exercises` API: читати й писати `muscles: { primary: string[], secondary:
   string[] }` (Zod: мінімум один primary; один код не в обох списках).
4. Дефолтна розмітка для 13 сідованих вправ у `createUserWithDefaults` +
   **бекфіл-міграція** для наявних користувачів за назвою вправи (точний збіг
   з дефолтними назвами). Пропозиція розмітки (узгодити з користувачем):

   | Вправа | Основні | Допоміжні (0,5) |
   |---|---|---|
   | Присідання | quads, glutes | adductors, lower_back |
   | Випади | quads, glutes | hamstrings, adductors |
   | Станова тяга | hamstrings, glutes, lower_back | upper_back, traps, forearms |
   | Жим штанги лежачи | chest | triceps, front_delts |
   | Тяга в нахилі | lats, upper_back | biceps, rear_delts |
   | Жим стоячи | front_delts | side_delts, triceps |
   | Віджимання | chest | triceps, front_delts |
   | Піднімання на біцепс | biceps | forearms |
   | Французький жим сидячи | triceps | — |
   | Розведення в сторону стоячи | side_delts | — |
   | Розведення в нахилі в сторону | rear_delts | upper_back |
   | Підняття ніг на прес | abs | — |
   | Підняття корпусу на прес | abs | — |
   | Підтягування (своя вправа) | lats | biceps, upper_back |

   Вправи без розмітки лишаються без неї (не вгадувати).
5. Тести: CRUD з м'язами, валідація, ізоляція користувачів, бекфіл.

### MCP
6. `list_exercises` і `create_exercise` — поле `muscles`. Новий
   `set_exercise_muscles(exercise, primary[], secondary[])` (`destructiveHint:
   false`, `idempotentHint: true`). Опис: «secondary muscles count as half a set in weekly volume».

### Фронтенд
7. Форма вправи: два блоки чипів з множинним вибором, групи «Жим · Тяга ·
   Ноги · Корпус»: «Основні м'язи» (валідація «Оберіть хоча б один основний
   м'яз») і «Допоміжні м'язи · рахуються як ½ підходу». Вибір в одному блоці
   прибирає м'яз з іншого.
8. Список вправ: бейдж «Без м'язів» і банер «N вправ без м'язів — вони не
   рахуються в тижневому обсязі. Призначити».
9. en/uk назви 17 груп (`muscles.<code>`).

## Обмеження
- `category` не чіпати — вона для прогресії, м'язи — для обсягу.

## Критерії готовності
- Усі 13 дефолтних вправ (і в нових, і в наявних акаунтах) мають розмітку.
- CLAUDE.md: таблиці, бекфіл, правило 1 / 0,5.
