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
  `tester` (тести + перевірка в dev-стеку), `docs-keeper` (оновлює `CLAUDE.md` і
  `docs/db/` під зміни гілки — поточний стан, без історії змін). Код пише головна сесія.
- Інші команди: `/review-changes` — рев'ю гілки; `/sync-docs` — наздогнати документацію
  (`docs-keeper` + коміт `docs:`) після змін поза `/feature` (з чату, руками, хотфікс);
  `/update-context` — оновити цей файл після змін.
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
| Сесії, refresh-токени, вхід через Google | `.claude/rules/auth.md` |
| PAT, OAuth для MCP-клієнтів (CIMD, DCR, згода, іконки) | `.claude/rules/oauth-and-tokens.md` |
| MCP-сервер (`mcp-server/`) | `.claude/rules/mcp-server.md` |
| Прогресія: «Спробуй більше», перерви, ручний зсув, модель навантаження, аналітика | `.claude/rules/progression.md` |
| Тренування: журнал, сторінка тренування, автозбереження, автозавершення, таймер, екран | `.claude/rules/workouts.md` |
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

Детальне пояснення архітектури БД (ER-діаграма, FK on delete, індекси, вибір
типів) — `docs/db/ARCHITECTURE.md`; `docs/db/schema.sql` — `pg_dump
--schema-only` (перезнімати після міграцій, команда — в кінці ARCHITECTURE.md).
Повні дампи з даними — тільки в `backups/` (у `.gitignore`: хеш пароля, refresh-токени).

- `users` — email/пароль. `passwordHash` nullable (акаунт, створений через Google, пароля не має), `googleSub` — Google ID (unique, nullable). `trainingDays` — jsonb-масив ISO-номерів днів тижня (1=Пн..7=Нд, default `[1,3,5]`), плановий розклад тренувань користувача (керується через `GET/PATCH /api/settings`, сторінка «Розклад» `/schedule`, `pages/SchedulePage.tsx` — з 2026-10-25 окремо від «Вправ», пункт у меню профілю й мобільному меню, посилання «Змінити розклад» у легенді календаря журналу); використовується календарем консистентності на журналі. `trainingTime`/`trainingDurationMin`/`timezone` + `calendarFeedTokenHash`/`calendarFeedCreatedAt` — для календарного фіда (див. "Календарний фід" у `.claude/rules/schedule-calendar.md`). `isDemo` (частковий unique-індекс `users_demo_idx` — максимум один) + `demoResetAt` — спільний демо-акаунт (див. "Демо-акаунт і стартові дані" у `.claude/rules/demo-template.md`)
- `refresh_tokens` — хеші refresh-токенів (unique-індекс на `token_hash` — кожен refresh шукає за ним). Ротація ставить `revokedAt`, logout рядок **видаляє** (див. "Auth: життя токенів" у `.claude/rules/auth.md`)
- `api_tokens` — персональні токени доступу (PAT) для програм (MCP-сервер, Claude Code): `name`, sha256 `tokenHash` (unique), `lastUsedAt`, `revokedAt` (відкликання м'яке — рядок лишається). Див. "Персональні токени доступу" у `.claude/rules/oauth-and-tokens.md`. Тут же живуть OAuth access-токени (`grantId` не null, `expiresAt` = +1 год)
- `oauth_authorization_requests` / `oauth_grants` / `oauth_refresh_tokens` — OAuth для MCP-клієнтів: запит на згоду (10 хв, прив'язаний до браузера `browserHash`, потім одноразовий код), підключення (grant — рядок у «Підключених застосунках») і його ротовані refresh-токени. `client_logo_uri` (nullable, лише https) — `logo_uri` з CIMD-документа, копіюється запит → grant так само, як `clientName`. `oauth_clients` — клієнти, зареєстровані через DCR (`id` = `mygym_cli_…`, хеш секрету, метод автентифікації, `redirect_uris` jsonb); не FK до grant-ів. Див. "OAuth для MCP-клієнтів" у `.claude/rules/oauth-and-tokens.md`
- `exercises` — вправи користувача (кожен юзер має свій список, сідиться 13 вправами при реєстрації, можна додавати свої через UI). Назва унікальна на користувача **разом з архівними** (без регістру й крайових пробілів): створення з назвою архівної вправи її **відновлює** (той самий id та історія, нові параметри; ручний зсув лічильника `tryMore*` лишається — оживе, якщо прогресу після архівації не було, як і для вправи, прибраної з програм), з назвою активної → 409 `exercise_name_taken`; PATCH, що робить `repRangeMin > repRangeMax`, → 400 `rep_range_invalid`. `tryMoreCounterAdjust` (smallint, default 0) + `tryMoreCounterAnchor` (date, nullable) — ручний зсув лічильника «тренувань без прогресу» (див. "Правила нагадування" у `.claude/rules/progression.md`). `unilateral` (bool) — ліва й права окремо, повторення пишуться **на одну сторону**; `limb` (`arm`/`leg`, лише при `unilateral`, CHECK) — для підписів «на руку / на ногу»; `defaultBarKg` (0–50, лише `barbell`, CHECK; сід і нові штанги — 20, `DEFAULT_BAR_KG`) — гриф за замовчуванням (міграція 0026, див. "Модель навантаження" у `.claude/rules/progression.md`)
- `workouts` — одне тренування (дата, timeStart/timeEnd — виставляються **автоматично**, не вручну; `autoFinished` — timeEnd поставив sweep, див. "Автозавершення тренування" у `.claude/rules/workouts.md`). `programLabel` — довільний текст (напр. «А»/«Б»), яким користувач сам позначає тренування для чергування програм (див. "Шаблони тренувань" у `.claude/rules/programs.md`). `programId` — nullable FK на `programs` (`onDelete: 'set null'`) — яка саме Програма (не мітка-текст) стартувала це тренування; видалення програми обнуляє лише це поле, саме тренування й підходи не чіпає. `pausedMs`/`pausedAt`/`resumedAt` — пауза таймера в хедері (міграція 0024, див. "Таймер тренування в хедері" у `.claude/rules/workouts.md`); тривалість = `timeEnd − timeStart − pausedMs`. `isSample` — приклад, скопійований з акаунта-шаблону при реєстрації (міграція 0025)
- `workout_exercises` — вправа в межах тренування. **Вага фіксується один раз на всю вправу** (не змінюється між підходами — підтверджено користувачем). Сенс полів залежить від `exercises.equipment` (з 2026-10-29, міграція 0026): штанга — `weightPerUnitKg` = диски на **одну** сторону, `weightUnits` завжди 2, `barKg` — снепшот грифа (0–50; без нього в запиті — `defaultBarKg` вправи); гантелі — `weightPerUnitKg` = **одна** гантель, `weightUnits` = скільки гантелей рухається в **одному** повторенні (1/2), `barKg` null; власна вага — `weightPerUnitKg` = обтяження. Нормалізує `storedLoad` (`workouts.service.ts`) — і для форми, і для CSV
- `sets` — підходи: тільки `setNumber` + `reps`. Кількість підходів довільна й незалежна для кожної вправи в межах тренування. **Вправа без жодного підходу** (з 2026-10-29) = «у тренуванні, ще не виконана»: зберігається (`sets: []` у `PUT …/exercises`), але не потрапляє в історію, `progressAt` (= null), календар консистентності й `getWorkoutDates` — усі вони читають лише вправи з підходами.
- **CHECK/UNIQUE-обмеження** (міграції 0021–0022, з 2026-10-24) дублюють межі Zod (повторення, вага, одиниці лише з вагою, діапазон повторень, пороги, `targetSets`, тривалість, PAT vs OAuth-токен) + одна вправа один раз у програмі (дубль у `POST/PUT /api/programs` → 400 `validation_error` / `duplicate_exercise` ще в Zod). Нова межа в Zod → поправити й CHECK. Default `weight_units` прибрано — писати явно. Міграція 0024 додала `workouts_paused_ms_check` (≥ 0) і `workouts_paused_open_check` (у завершеного тренування нема відкритої паузи). Список — `docs/db/ARCHITECTURE.md` → «Обмеження».
- `programs` / `program_exercises` — іменована багаторазова програма (напр. «Програма А») з ротацією: `programs.orderIndex` визначає чергу (A→Б→A…), присвоюється автоматично в кінець черги при створенні. `program_exercises.tryMoreAfterWorkouts` (nullable) — поріг `try_more` вправи в цій програмі, `null` = стандарт категорії (див. "Правила нагадування" у `.claude/rules/progression.md`); порогу на всю програму нема — `programs.try_more_after_workouts` видалено міграцією 0028 **без переносу** у вправи (рішення користувача 2026-10-31). `program_exercises.lockSets` — фіксована кількість підходів (міграція 0027). `program_exercises` НЕ зберігає вагу (`targetSets` + `orderIndex` замість `weightPerUnitKg`/`weightUnits`) — вага й повторення підтягуються з останнього фактичного виконання вправи при старті тренування, а не зі старого "стартового" значення (див. "Програми" у `.claude/rules/programs.md`).
- `training_schedule_history` — один рядок на кожен день, коли `users.trainingDays` реально змінився (`trainingDays` + `effectiveFrom`, unique по `(userId, effectiveFrom)` — повторна зміна того ж дня перезаписує рядок, а не плодить нові). Дає змогу календарю консистентності судити про минулі дати за розкладом, який діяв **тоді**, а не поточним (див. "Календар консистентності" у `.claude/rules/schedule-calendar.md`).

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
- Дати/тривалість/вага форматуються мовозалежно через `utils/weight.ts`
  (`formatDate`/`formatDuration`/`formatTotalWeight`, використовують
  `i18n.language` напряму — це plain-функції поза React-деревом, не хуки).
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
