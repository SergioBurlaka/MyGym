# План: нагадування про тренування в календарі (ICS-фід)

> Для запуску в Claude Code: `/feature` + посилання на цей файл
> (наприклад, `/feature реалізуй план з docs/plans/calendar-feed-plan.md`).
> Гілка: `feat/calendar-feed`.

## Мета

Користувач підписується на свій розклад MyGym у Google / Apple / Outlook Calendar.
У календарі з'являються повторювані події «Тренування» в дні з `users.trainingDays`
у заданий час, з нагадуванням. Коли користувач змінює розклад у MyGym, календар
підтягує зміни сам.

## Як це працює

1. У формі розкладу (сторінка «Вправи», внизу) з'являються поля **час** і
   **тривалість**. Часовий пояс підставляється автоматично з браузера.
2. Кнопка **«Підключити календар»** генерує секретний токен і показує:
   - кнопку «Відкрити в календарі» (`webcal://…`, для Apple/Outlook і телефона);
   - кнопку «Додати в Google Calendar» (`https://calendar.google.com/calendar/r?cid=<urlencoded webcal URL>`);
   - кнопку «Скопіювати посилання».
3. Календар періодично сам запитує `GET /api/calendar/feed/<token>.ics`, а бекенд
   щоразу віддає актуальний розклад.
4. Можна **перегенерувати** посилання (старе перестає працювати) або **відключити**.

## Відомі обмеження (показати користувачу підказкою в UI)

- Google оновлює підписані календарі із затримкою, до ~12–24 год.
- Google ігнорує `VALARM` у підписаних календарях, тож час нагадування береться
  з налаштувань Google-календаря користувача. Apple Calendar / Outlook нагадування з фіда поважають.
- На `localhost` підписку з телефона не перевірити. У dev перевіряємо через `curl` і валідатор ICS.

---

## 1. БД — `feat(db): add training time, timezone and calendar feed token`

У `backend/src/db/schema.ts`, таблиця `users`:

| Колонка | Тип | Default | Навіщо |
| :-- | :-- | :-- | :-- |
| `training_time` | `text` (`HH:MM`) | `'18:00'` | час початку тренування |
| `training_duration_min` | `integer` | `60` | тривалість події |
| `timezone` | `text` (IANA) | `'Europe/Kyiv'` | щоб подія не з'їжджала в UTC і коректно переходила на зимовий/літній час |
| `calendar_feed_token_hash` | `text`, nullable, unique | `null` | SHA-256 токена фіда (`null` означає, що календар не підключено) |
| `calendar_feed_created_at` | `timestamptz`, nullable | `null` | для UI: «підключено …» |

- Міграція через `drizzle-kit generate`, наступний номер `0013_…`.
- Час і пояс у `training_schedule_history` **не** додаємо, бо історія лишається тільки про дні (див. п. 3).
- Після міграції перезняти `docs/db/schema.sql` (команда в кінці `docs/db/ARCHITECTURE.md`) і дописати колонки в `ARCHITECTURE.md`.

## 2. Налаштування — `feat(backend): extend settings with training time and timezone`

`backend/src/modules/settings/`:

- `settings.schema.ts`: усі поля в `updateSettingsSchema` стають **опціональними**
  (PATCH змінює тільки передане), додаються:
  - `trainingTime`: `z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)`
  - `trainingDurationMin`: `z.number().int().min(15).max(300)`
  - `timezone`: `z.string().refine(tz => Intl.supportedValuesOf('timeZone').includes(tz))`
  - вимога: хоча б одне поле в тілі.
- `settings.service.ts`:
  - `getSettings` повертає нові поля, а також `calendarConnected: boolean` і `calendarConnectedAt`.
  - `updateSettings` пише в `training_schedule_history` **тільки** якщо в тілі є `trainingDays`. Поточна логіка (один рядок на день, upsert) не змінюється.

## 3. Модуль календаря — `feat(backend): add ICS calendar feed`

Новий модуль `backend/src/modules/calendar/` (`calendar.routes.ts`, `calendar.service.ts`, `calendar.schema.ts`),
реєстрація в `app.ts` з префіксом `/api/calendar`.

### Токен (за зразком `apiTokens` / `utils/tokens.ts`)

- `CALENDAR_TOKEN_PREFIX = 'mygym_cal_'` + `crypto.randomBytes(32).toString('hex')`.
- У БД лежить тільки хеш (`hashRefreshToken`, той самий SHA-256).
- Повний URL показується **один раз**, при генерації (як PAT). Потім доступні тільки «перегенерувати» й «відключити».

### Роути

| Метод | Шлях | Auth | Що робить |
| :-- | :-- | :-- | :-- |
| `POST` | `/api/calendar/token` | JWT | створює/перегенеровує токен, повертає `{ feedUrl, webcalUrl, googleUrl }` |
| `DELETE` | `/api/calendar/token` | JWT | обнуляє хеш, фід починає повертати 404 |
| `GET` | `/api/calendar/feed/:file` | **без JWT**, токен в URL | віддає `.ics` |

- `authenticate` вішати на рівні окремих роутів (не `addHook` на весь модуль), бо фід публічний.
- `:file` валідувати Zod-ом: `^mygym_cal_[a-f0-9]{64}\.ics$`. Невалідний або невідомий токен дає `404` (не `401`, щоб не підтверджувати існування).
- Rate limit на фід (`@fastify/rate-limit` уже підключений, `global: false`): наприклад 60/год на IP.
- Відповідь: `Content-Type: text/calendar; charset=utf-8`, `Cache-Control: no-cache`,
  `Content-Disposition: inline; filename="mygym.ics"`.
- URL будувати від `env.PUBLIC_URL`: `webcalUrl` = той самий URL зі схемою `webcal://`.

### Генерація ICS

Бібліотека: `ical-generator`. `researcher` має перевірити актуальну версію й те, як вона задає `TZID` / `VTIMEZONE`.

- Календар: `name: 'MyGym'`, `X-WR-CALNAME`, `REFRESH-INTERVAL;VALUE=DURATION:PT6H` + `X-PUBLISHED-TTL:PT6H` (підказка клієнтам частіше оновлюватись; Google це ігнорує).
- **По одній серії подій на кожен рядок `training_schedule_history`**, щоб минулі тижні відповідали тодішньому розкладу:
  - `DTSTART` — перший день з `trainingDays` на або після `effectiveFrom`, о `trainingTime` у `timezone`;
  - `DTEND` = `DTSTART` + `trainingDurationMin`;
  - `RRULE:FREQ=WEEKLY;BYDAY=<MO,WE,FR>` (мапа ISO 1..7 → `MO..SU`);
  - `UNTIL` = кінець дня перед `effectiveFrom` наступного рядка (для останнього рядка без `UNTIL`);
  - рядки з порожнім `trainingDays` пропускаються.
  - Час і тривалість беруться **поточні** для всіх серій (історія часу не зберігається; це прийнятно).
- `UID` стабільний: `schedule-<historyRowEffectiveFrom>-<userId>@mygym`, щоб календар оновлював події, а не дублював.
- `SUMMARY`: «Тренування» / «Workout». Мову обрати за `Accept-Language` запиту або англійську за замовчуванням (уточнити на етапі плану).
- `DESCRIPTION`: посилання на `PUBLIC_URL`.
- `VALARM`: `ACTION:DISPLAY`, `TRIGGER:-PT30M` (константа; налаштовуване нагадування поза скоупом v1).

### Nginx

Перевірити, що `/api/calendar/feed/*` проходить через існуючий `location /api/` у `nginx/templates` і що nginx не кешує й не ріже `text/calendar`.

## 4. Frontend — `feat(frontend): calendar subscription in schedule settings`

- `frontend/src/shared/api/settings/`: розширити `settings.types.ts`, `settings.api.ts`, мутацію.
- Новий ресурс `frontend/src/shared/api/calendar/` за конвенцією проєкту:
  `calendar.api.ts`, `calendar.keys.ts`, `hooks/useCreateCalendarTokenMutation.ts`, `hooks/useDeleteCalendarTokenMutation.ts`.
- `ExercisesPage.tsx`, форма розкладу:
  - поля `time` (input type="time") і тривалість (select: 30/45/60/75/90/120);
  - `timezone` неявний: при збереженні відправляти `Intl.DateTimeFormat().resolvedOptions().timeZone`, якщо він відрізняється від збереженого;
  - блок «Календар»:
    - не підключено → кнопка «Підключити календар»;
    - щойно згенеровано → три кнопки (webcal / Google / копіювати) + попередження «посилання показується один раз»;
    - підключено раніше → «Підключено <дата>» + «Перегенерувати» (з `Popconfirm`) + «Відключити»;
    - коротка підказка про затримку оновлення й нагадування в Google.
  - Варто винести блок в окремий компонент `components/CalendarSubscription.tsx`.
- i18n: ключі в `en.json` і `uk.json` (дзеркально, звірити скриптом).

## 5. Тести — `test(backend): cover calendar feed and settings`

Новий `backend/test/calendar.test.ts`, плюс доповнити `api.test.ts` для налаштувань:

- PATCH settings: валідний/невалідний `trainingTime`, `timezone`, часткове оновлення без `trainingDays` **не** створює рядок в історії.
- `POST /api/calendar/token` без JWT дає 401; з JWT повертає URL-и, у БД лежить хеш, а не токен.
- Повторний `POST` інвалідує старий токен (старий URL дає 404).
- `GET feed` з валідним токеном: 200, `text/calendar`, є `BEGIN:VCALENDAR`, `RRULE` з правильним `BYDAY`, `TZID` користувача, `VALARM`.
- Історія з двох рядків дає дві серії, перша з `UNTIL`.
- Невалідний формат / невідомий токен / після `DELETE` дає 404.
- Фід не віддає даних іншого користувача.
- `tester`: у dev-стеку `curl` фіда + перевірка валідатором ICS (наприклад, icalendar.org validator або парсинг `node-ical` у тесті).

## 6. Документація — `docs: describe calendar feed`

- `/update-context`: розділ про календарний фід у `CLAUDE.md` (роути, токен, обмеження Google).
- `docs/db/ARCHITECTURE.md` і `docs/db/schema.sql` (п. 1).

---

## Критерії готовності

- [ ] Користувач задає дні, час і тривалість, натискає «Підключити календар» і отримує робочі посилання.
- [ ] Підписка в Apple Calendar показує події з нагадуванням за 30 хв у правильному часі (Europe/Kyiv, включно з переходом на зимовий час).
- [ ] Підписка в Google Calendar через «Додати в Google» показує події.
- [ ] Зміна днів/часу в MyGym з'являється в календарі після оновлення фіда.
- [ ] Перегенерація/відключення робить старий URL недійсним (404).
- [ ] CI зелений (`backend-test`, `frontend-build`), i18n-ключі дзеркальні.

## Поза скоупом v1

- Google Calendar API (OAuth scope `calendar.events`) і точні нагадування в Google.
- Web Push-нагадування.
- Налаштовуваний час нагадування, назва програми в події.
