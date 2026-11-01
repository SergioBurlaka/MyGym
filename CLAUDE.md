# MyGym — контекст проєкту

Особистий багатокористувацький щоденник тренувань (вільні ваги: гантелі,
штанга, лавка, стійки). Записуєш підходи, дивишся графіки прогресу по кожній
вправі, отримуєш нагадування, коли пора додати вагу чи повторення.

## Як працювати (оркестратор)

- **Фіча чи фікс, описані словами** → `/feature <опис>`: гілка → план (чекати "ок")
  → реалізація з комітами → рев'ю (`reviewer`) → тести (`tester`) → документація
  (`docs-keeper`) → звіт.
- **Чат claude.ai (проєкт MyGym) код не змінює.** Там — обговорення, рішення й
  специфікації (`docs/tasks/<slug>.md`) або готовий промпт для `/feature`; реалізація —
  лише через `/feature` у терміналі (гілка, рев'ю, тести, хук `guard.mjs`, документація).
  Страховка, якщо зміна таки пройшла повз: `docs-keeper` рахує дельту не від `main`, а від
  `docs/.docs-synced` (SHA, до якого документація актуальна), тож підхопить її в наступному
  циклі; щоб не чекати — `/sync-docs`.
  Дрібне питання чи однорядкова правка — без повного циклу.
- **Git:** одна фіча — одна гілка, кілька комітів `feat:`/`fix:`/`chore:`…;
  у `main` не комітити й не пушити (push у `main` = деплой). Деталі —
  `.claude/rules/git-workflow.md` (правило без `paths`, вантажиться завжди саме).
- **Заборонено:** читати/змінювати `.env*` (крім `.env.example`) і `backups/`;
  деструктивні команди. Це примусово тримає хук `.claude/hooks/guard.mjs`.
- Субагенти: `researcher` (дослідження, без правок), `reviewer` (рев'ю диффу),
  `tester` (тести + перевірка в dev-стеку), `docs-keeper` (оновлює `CLAUDE.md`,
  `.claude/rules/` і `docs/db/` під зміни гілки — поточний стан, без історії змін). Код пише головна сесія.
- Інші команди: `/review-changes` — рев'ю гілки; `/sync-docs` — наздогнати документацію
  (`docs-keeper` + коміт `docs:`) після змін поза `/feature` (з чату, руками, хотфікс);
  `/update-context` — оновити цей файл і правила після змін.
- Скіли тренерів (копії акаунтних скілів Claude; при зміні оновлювати обидва місця):
  `.claude/skills/mygym-bodybuilding-coach` — тренер на даних MyGym через MCP;
  `.claude/skills/bodybuilding-coach` — універсальний (CSV, таблиці, трекер). Поріг
  застою «Спробуй більше» в них (4/6/5, перерви 10/14 днів) має збігатися з
  `DEFAULT_TRY_MORE_AFTER_WORKOUTS` і `docs/research/try-more-threshold.md`.
- Дизайн-рев'ю: `.claude/skills/senior-design-review` (копія акаунтного скіла, при зміні
  оновлювати обидва місця) — погляд сеньйор-дизайнера на живий застосунок, десктоп 1440 і мобайл 375,
  проби + критика + фітнес-модуль. Стандарт, за яким він судить, — `DESIGN_PRINCIPLES.md` у корені
  (токени, кольорова семантика, ієрархія дій, мобайл, основний цикл у залі); правило дизайну змінюється там.

## Стек (узгоджено з користувачем, не змінювати без явного запиту)

- **Backend:** Node.js + TypeScript, Fastify + Zod (валідація), Drizzle ORM + drizzle-kit (міграції), PostgreSQL
- **Auth:** email + пароль (argon2) **або вхід через Google** (OAuth, `google-auth-library` 10.x — див. "Вхід через Google" у `.claude/rules/auth.md`), JWT access + refresh (refresh — httpOnly cookie, зберігається в БД для відкликання), multi-user. Для програм — PAT і власний OAuth authorization server для MCP-клієнтів (див. "OAuth для MCP-клієнтів" у `.claude/rules/oauth-and-tokens.md`)
- **Frontend:** React + TypeScript + Vite, Tailwind CSS, Recharts (графіки), TanStack Query для даних із бекенду (структура `frontend/src/shared/api/<ресурс>/` — `*.api.ts` + `*.keys.ts` (`@lukemorales/query-key-factory`) + `hooks/use*Query.ts`/`use*Mutation.ts`, скопійовано з конвенції іншого проєкту користувача)
- **i18n:** `react-i18next` + `i18next-browser-languagedetector` — автовизначення мови з браузера (`localStorage` → `navigator` → fallback `en`), перемикач у `Navbar.tsx` (`components/LanguageSwitcher.tsx`). Словники — `frontend/src/i18n/locales/{en,uk}.json` (дзеркальна структура ключів, звіряється скриптом при кожній зміні)
- **Інфраструктура:** Docker (окремі контейнери: postgres, backend, frontend, mcp, nginx), docker-compose для dev (hot-reload) і prod, nginx reverse-proxy з HTTPS (DuckDNS-домен + Let's Encrypt/certbot, див. "Прод: HTTPS" у `.claude/rules/infra-prod.md`)
- **Node 24 LTS** (підтримка до 04.2028) у всіх Dockerfile-ах і CI — з 2026-10-22, замість Node 20 (EOL 04.2026). Версія зафіксована в 7 Dockerfile-ах (`node:24-alpine`) і 3 джобах `deploy.yml` — міняти разом. Після зміни версії в dev — `npm install` у контейнерах (named volumes `*_node_modules` не оновлюються самі, `argon2` — нативний модуль)

Ці рішення — результат явного обговорення з користувачем (Fastify+Zod над
Express/NestJS, Drizzle над Prisma/TypeORM, Recharts над Chart.js, JWT над
сесіями в БД) — не пропонувати альтернативи без запиту.

## Де що описано

Тут — лише те, що потрібно в кожній сесії. Деталі модулів — у `.claude/rules/*.md`:
кожне правило має `paths:` і підвантажується само, щойно читаєш чи редагуєш файл, що під
нього підпадає (пошук `Grep` його **не** вантажить). Питання про тему без відкритого коду →
спершу прочитай відповідне правило.

| Тема | Правило |
| :-- | :-- |
| Сесії, refresh-токени, таймаут запитів фронтенду, вхід через Google | `.claude/rules/auth.md` |
| PAT, OAuth для MCP-клієнтів (CIMD, DCR, згода, іконки) | `.claude/rules/oauth-and-tokens.md` |
| MCP-сервер (`mcp-server/`) | `.claude/rules/mcp-server.md` |
| Вправи: унікальність назви, архів, однобічні, гриф | `.claude/rules/exercises.md` |
| Прогресія: «Спробуй більше», перерви, ручний зсув, модель навантаження, аналітика | `.claude/rules/progression.md` |
| Тренування: журнал, сторінка тренування, автозбереження, автозавершення, таймер, екран, офлайн-банер, сторінка 404 | `.claude/rules/workouts.md` |
| Шаблони А/Б і програми | `.claude/rules/programs.md` |
| Розклад, календар консистентності, календарний фід | `.claude/rules/schedule-calendar.md` |
| Демо-акаунт і стартові дані | `.claude/rules/demo-template.md` |
| CSV-імпорт | `.claude/rules/csv-import.md` |
| Прод: HTTPS, nginx, деплой | `.claude/rules/infra-prod.md` |
| Dev-середовище на Windows (hot-reload, volumes, порти) | `.claude/rules/dev-env.md` |
| Логотип, іконки, PWA | `.claude/rules/branding-pwa.md` |
| Git-процес | `.claude/rules/git-workflow.md` (вантажиться завжди) |
| Архітектура БД, ER-діаграма | `docs/db/ARCHITECTURE.md` |
| Дизайн-стандарт | `DESIGN_PRINCIPLES.md` |

Нова тема → нове правило з `paths:` (до ~200 рядків і 40 000 символів — довше обрізається),
рядок у цій таблиці; спільне для всього застосунку — сюди.

## Модель даних (backend/src/db/schema.ts)

Повна архітектура БД (ER-діаграма, FK on delete, індекси, обмеження, вибір типів) —
`docs/db/ARCHITECTURE.md`; `docs/db/schema.sql` — `pg_dump --schema-only` (перезнімати після
міграцій, команда — в кінці ARCHITECTURE.md). Повні дампи з даними — тільки в `backups/` (у
`.gitignore`: хеш пароля, refresh-токени).

Таблиці й де описані їхні поля (`.claude/rules/…`):
- `users` — акаунт (`passwordHash` nullable — вхід лише через Google, `googleSub`) → `auth.md`;
  розклад і календарний фід → `schedule-calendar.md`; демо → `demo-template.md`
- `refresh_tokens` (unique `token_hash` — кожен refresh шукає за ним) → `auth.md`; `api_tokens`, `oauth_*` → `oauth-and-tokens.md`
- `exercises` → `exercises.md`; `workouts` → `workouts.md`
- `programs`, `program_exercises` → `programs.md`; `training_schedule_history` → `schedule-calendar.md`
- `workout_exercises` (вправа в тренуванні) і `sets` (`setNumber` + `reps`) — правила нижче

Правила, що діють скрізь:
- **Вага фіксується один раз на всю вправу** в тренуванні (не між підходами). Сенс полів
  `workout_exercises` — за `exercises.equipment` (міграція 0026): штанга — `weightPerUnitKg` = диски
  на **одну** сторону, `weightUnits` завжди 2, `barKg` — снепшот грифа (0–50; без нього в запиті —
  `defaultBarKg` вправи); гантелі — `weightPerUnitKg` = **одна** гантель, `weightUnits` = скільки
  гантелей у **одному** повторенні (1/2), `barKg` null; власна вага — `weightPerUnitKg` = обтяження.
  Нормалізує `storedLoad` (`workouts.service.ts`) — і для форми, і для CSV.
- **Вправа без жодного підходу** = «у тренуванні, ще не виконана»: зберігається (`sets: []` у
  `PUT …/exercises`), але не потрапляє в історію, `progressAt` (= null), календар консистентності й
  `getWorkoutDates` — усі читають лише вправи з підходами. Кількість підходів довільна й
  незалежна для кожної вправи.
- **CHECK/UNIQUE** (міграції 0021–0022, 0024) дублюють межі Zod (повторення, вага, одиниці лише з
  вагою, діапазон повторень, пороги, `targetSets`, тривалість, PAT vs OAuth-токен): нова межа в Zod →
  поправити й CHECK. Default `weight_units` нема — писати явно. Список —
  `docs/db/ARCHITECTURE.md` → «Обмеження».

## Захист API та тести

- **Rate limit** (`@fastify/rate-limit`, `global: false`): лише `/api/auth/login`
  (10/хв), `/api/auth/register` (5/15 хв) і обидва Google-роути (20/хв) на IP —
  константи `LOGIN_RATE_LIMIT`/`REGISTER_RATE_LIMIT`/`GOOGLE_RATE_LIMIT` в `auth.routes.ts`. `/refresh` свідомо без ліміту — його
  смикає кожна відкрита вкладка (таймер, `visibilitychange`). OAuth:
  `/api/oauth/register` 10/год, `/api/oauth/authorize` 30/хв, `/api/oauth/token` і `/api/oauth/client-icon`
  60/хв на IP (`AUTHORIZE_RATE_LIMIT`/`TOKEN_RATE_LIMIT`/`CLIENT_ICON_RATE_LIMIT`
  в `oauth.routes.ts`). `/api/auth/demo` — 20/год на IP (`DEMO_RATE_LIMIT`): кожен
  вхід у демо — рядок `refresh_tokens` спільного акаунта.
- **`trustProxy` = рівно один хоп** (`(addr, hop) => hop === 0` в `app.ts`), а не
  `true`: з `true` Fastify брав би крайню ліву, клієнтську адресу з
  `X-Forwarded-For`, і rate limit обходився б підробленим заголовком. Протокол
  (`X-Forwarded-Proto` для `Secure`-cookie) працює як раніше. Якщо колись
  з'явиться ще один проксі перед nginx (Cloudflare тощо) — збільшити кількість хопів.
- **UUID у path-параметрах** (`plugins/idParams.ts`): глобальний `preValidation`
  хук — будь-який параметр `id`/`*Id` має бути UUID, інакше 400 `invalid_id`
  (раніше невалідний id доходив до Postgres і давав 500).
- **Єдиний error handler** (`plugins/errorHandler.ts`): 429 → `too_many_requests`,
  інші 4xx від Fastify (битий JSON тощо) → `bad_request`, 5xx → `internal_error`
  без деталей SQL/драйвера (стек — лише в лог). Коди перекладені в
  `errors.*` у `en/uk.json`.
- **Реєстрація транзакційна** (`registerUser`): user + рядок історії розкладу +
  13 вправ (+ стартові дані з шаблону — у savepoint, збій копіювання реєстрацію не
  валить, див. "Демо-акаунт і стартові дані" у `.claude/rules/demo-template.md`) в одній транзакції; гонка двох реєстрацій з одним email ловиться
  через unique violation (`23505`, `utils/pgErrors.ts::isUniqueViolation`) → `email_taken`, а не 500.
- **Тести** — `backend/test/`, `npm test` (Vitest). Інтеграційні через
  `app.inject()` проти справжнього Postgres (міграції застосовуються в
  `test/globalSetup.ts`; між тестами `TRUNCATE users CASCADE`, тому назва БД
  мусить містити `test` — інакше запуск падає). Правила прогресії винесені в
  чисті функції `suggestProgression`/`buildHistoryPoints` саме заради юніт-тестів.
  Свіжий `buildApp()` на кожен тест = свіже in-memory сховище rate limit.
- **CI** (`.github/workflows/deploy.yml`): `backend-test` (typecheck + тести з
  postgres-сервісом), `frontend-build` і `mcp-server-test` на кожен push/PR;
  `deploy` — тільки push у `main` і тільки після всіх трьох зелених джобів.

## Локалізація (i18n)

Весь UI-текст фронтенду й повідомлення помилок з бекенду перекладаються —
en/uk, автовизначення мови з браузера (див. "Стек" вище).

- **Конвенція помилок:** кожна 4xx-відповідь бекенду вже мала стабільне поле
  `error` (код) поруч із `message` (українська проза). Фронтенд тепер
  перекладає САМЕ `error`-код через `errors.<code>` у словнику
  (`utils/apiError.ts::translateApiError`), а не показує сирий `message`.
  Бекендові Zod-кастомні повідомлення валідації (`.min()/.max()`) теж
  переведені з української прози на короткі коди (`name_required` тощо) —
  хоча фронтенд ніколи не рендерив масив `issues[].message` напряму, тож
  практичного ефекту це не мало, зроблено для консистентності.
- **Повідомлення прогресії:** раніше бекенд генерував готове речення
  (`ExerciseProgression.message`) — тепер це поле прибрано з відповіді й типу
  повністю. Фронтенд сам будує переклад з числових полів, які бекенд і так
  віддає (`repRangeMax`, `weightStepKg`, `daysSinceProgress`) через
  `utils/progressionMessage.ts`, ключі `progression.message.<suggestion>`.
- **Числа однакові в обох мовах** (рішення користувача): десяткова крапка, тисячі без
  розділювача («40.5», «1728»). Весь вивід чисел — через `utils/weight.ts`: `formatKg` (вага,
  до 2 знаків), `formatStepKg` (крок ваги, завжди 2 знаки — «0.50»), `formatDecimal(value, digits)`,
  `formatCompactNumber` (осі; слово «тис.»/«K» — з мови). Усі йдуть через приватну
  `formatNumber` (`Intl.NumberFormat.formatToParts`: `decimal` → «.», `group` прибирається).
  Введення з комою приймає `parseKg`. Тест — `utils/weight.test.ts`.
- Дати й тривалість — мовозалежні (`formatDate`/`formatDuration` у `utils/weight.ts`).
  Ці функції читають `i18n.language` напряму — plain-функції поза React-деревом, не хуки.
- **Назви вправ НЕ перекладаються** — це дані користувача (свої/сідовані при
  реєстрації), а не UI-текст; переклад зламав би зіставлення з CSV-імпортом.

## Стан проєкту

Повністю робочий MVP: auth, CRUD вправ/тренувань, форма запису з гнучкою
кількістю підходів на вправу, графіки прогресу (Recharts), CSV-імпорт,
Docker-стек (dev + prod), nginx reverse-proxy. Backend покритий автотестами (`backend/test/`, див.
"Захист API та тести"). Frontend компілюється і збирається
(vite build) без помилок.

Перевірено реальний підйом dev-стека (`docker compose -f docker-compose.dev.yml
up --build`) на машині користувача (Windows + Docker Desktop): postgres,
backend, frontend піднімаються і відповідають на health-check.

## Стиль спілкування з користувачем

Користувач — програміст, спілкується українською, любить розуміти "чому"
за кожним технічним рішенням (просив пояснення різниці JWT vs сесії,
Drizzle vs Prisma тощо) перед тим як погодитись. При зміні стеку чи підходу
— пояснювати компроміси, а не просто міняти мовчки.
