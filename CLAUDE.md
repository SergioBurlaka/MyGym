# MyGym — контекст проєкту

Особистий багатокористувацький щоденник тренувань (вільні ваги: гантелі,
штанга, лавка, стійки). Записуєш підходи, дивишся графіки прогресу по кожній
вправі, отримуєш нагадування, коли пора додати вагу чи повторення.

## Як працювати (оркестратор)

- **Фіча чи фікс, описані словами** → `/feature <опис>`: гілка → план (чекати "ок")
  → реалізація з комітами → рев'ю (`reviewer`) → тести (`tester`) → звіт.
  Дрібне питання чи однорядкова правка — без повного циклу.
- **Git:** одна фіча — одна гілка, кілька комітів `feat:`/`fix:`/`chore:`…;
  у `main` не комітити й не пушити (push у `main` = деплой). Деталі:
  @.claude/rules/git-workflow.md
- **Заборонено:** читати/змінювати `.env*` (крім `.env.example`) і `backups/`;
  деструктивні команди. Це примусово тримає хук `.claude/hooks/guard.mjs`.
- Субагенти: `researcher` (дослідження, без правок), `reviewer` (рев'ю диффу),
  `tester` (тести + перевірка в dev-стеку). Код пише головна сесія.
- Інші команди: `/review-changes` — рев'ю гілки; `/update-context` — оновити цей файл після змін.

## Стек (узгоджено з користувачем, не змінювати без явного запиту)

- **Backend:** Node.js + TypeScript, Fastify + Zod (валідація), Drizzle ORM + drizzle-kit (міграції), PostgreSQL
- **Auth:** email + пароль (argon2) **або вхід через Google** (OAuth, `google-auth-library` 10.x — див. "Вхід через Google"), JWT access + refresh (refresh — httpOnly cookie, зберігається в БД для відкликання), multi-user. Для програм — PAT і власний OAuth authorization server для MCP-клієнтів (див. "OAuth для MCP-клієнтів")
- **Frontend:** React + TypeScript + Vite, Tailwind CSS, Recharts (графіки), TanStack Query для даних із бекенду (структура `frontend/src/shared/api/<ресурс>/` — `*.api.ts` + `*.keys.ts` (`@lukemorales/query-key-factory`) + `hooks/use*Query.ts`/`use*Mutation.ts`, скопійовано з конвенції іншого проєкту користувача)
- **i18n:** `react-i18next` + `i18next-browser-languagedetector` — автовизначення мови з браузера (`localStorage` → `navigator` → fallback `en`), перемикач у `Navbar.tsx` (`components/LanguageSwitcher.tsx`). Словники — `frontend/src/i18n/locales/{en,uk}.json` (дзеркальна структура ключів, звіряється скриптом при кожній зміні)
- **Інфраструктура:** Docker (окремі контейнери: postgres, backend, frontend, mcp, nginx), docker-compose для dev (hot-reload) і prod, nginx reverse-proxy з HTTPS (DuckDNS-домен + Let's Encrypt/certbot, див. "Прод: HTTPS" нижче)
- **Node 24 LTS** (підтримка до 04.2028) у всіх Dockerfile-ах і CI — з 2026-10-22, замість Node 20 (EOL 04.2026). Версія зафіксована в 7 Dockerfile-ах (`node:24-alpine`) і 3 джобах `deploy.yml` — міняти разом. Після зміни версії в dev — `npm install` у контейнерах (named volumes `*_node_modules` не оновлюються самі, `argon2` — нативний модуль)

Ці рішення — результат явного обговорення з користувачем (Fastify+Zod над
Express/NestJS, Drizzle над Prisma/TypeORM, Recharts над Chart.js, JWT над
сесіями в БД) — не пропонувати альтернативи без запиту.

## Модель даних (backend/src/db/schema.ts)

Детальне пояснення архітектури БД (ER-діаграма, FK on delete, індекси, вибір
типів) — `docs/db/ARCHITECTURE.md`; `docs/db/schema.sql` — `pg_dump
--schema-only` (перезнімати після міграцій, команда — в кінці ARCHITECTURE.md).
Повні дампи з даними — тільки в `backups/` (у `.gitignore`: хеш пароля, refresh-токени).

- `users` — email/пароль. `passwordHash` nullable (акаунт, створений через Google, пароля не має), `googleSub` — Google ID (unique, nullable). `trainingDays` — jsonb-масив ISO-номерів днів тижня (1=Пн..7=Нд, default `[1,3,5]`), плановий розклад тренувань користувача (керується через `GET/PATCH /api/settings`, форма внизу сторінки "Вправи"); використовується календарем консистентності на журналі. `trainingTime`/`trainingDurationMin`/`timezone` + `calendarFeedTokenHash`/`calendarFeedCreatedAt` — для календарного фіда (див. "Календарний фід" нижче)
- `refresh_tokens` — хеші refresh-токенів. Ротація ставить `revokedAt`, logout рядок **видаляє** (див. "Auth: життя токенів" нижче)
- `api_tokens` — персональні токени доступу (PAT) для програм (MCP-сервер, Claude Code): `name`, sha256 `tokenHash` (unique), `lastUsedAt`, `revokedAt` (відкликання м'яке — рядок лишається). Див. "Персональні токени доступу" нижче. Тут же живуть OAuth access-токени (`grantId` не null, `expiresAt` = +1 год)
- `oauth_authorization_requests` / `oauth_grants` / `oauth_refresh_tokens` — OAuth для MCP-клієнтів: запит на згоду (10 хв, прив'язаний до браузера `browserHash`, потім одноразовий код), підключення (grant — рядок у «Підключених застосунках») і його ротовані refresh-токени. `client_logo_uri` (nullable, лише https) — `logo_uri` з CIMD-документа, копіюється запит → grant так само, як `clientName`. `oauth_clients` — клієнти, зареєстровані через DCR (`id` = `mygym_cli_…`, хеш секрету, метод автентифікації, `redirect_uris` jsonb); не FK до grant-ів. Див. "OAuth для MCP-клієнтів" нижче
- `exercises` — вправи користувача (кожен юзер має свій список, сідиться 13 вправами при реєстрації, можна додавати свої через UI). `tryMoreCounterAdjust` (smallint, default 0) + `tryMoreCounterAnchor` (date, nullable) — ручний зсув лічильника «тренувань без прогресу» (див. "Правила нагадування")
- `workouts` — одне тренування (дата, timeStart/timeEnd — виставляються **автоматично**, не вручну). `programLabel` — довільний текст (напр. «А»/«Б»), яким користувач сам позначає тренування для чергування програм (див. "Шаблони тренувань" нижче). `programId` — nullable FK на `programs` (`onDelete: 'set null'`) — яка саме Програма (не мітка-текст) стартувала це тренування; видалення програми обнуляє лише це поле, саме тренування й підходи не чіпає
- `workout_exercises` — вправа в межах тренування. **Вага фіксується один раз на всю вправу** (не змінюється між підходами — підтверджено користувачем), зберігається як `weightPerUnitKg` + `weightUnits` (зазвичай 2 — по обидва боки штанги / обидві гантелі)
- `sets` — підходи: тільки `setNumber` + `reps`. Кількість підходів довільна й незалежна для кожної вправи в межах тренування.
- `programs` / `program_exercises` — іменована багаторазова програма (напр. «Програма А») з ротацією: `programs.orderIndex` визначає чергу (A→Б→A…), присвоюється автоматично в кінець черги при створенні. `programs.tryMoreAfterWorkouts` — nullable, перевизначає правило `try_more` для вправ програми; `program_exercises.tryMoreAfterWorkouts` (nullable) — поріг окремої вправи, має пріоритет над програмним (див. "Правила нагадування"). `program_exercises` НЕ зберігає вагу (`targetSets` + `orderIndex` замість `weightPerUnitKg`/`weightUnits`) — вага й повторення підтягуються з останнього фактичного виконання вправи при старті тренування, а не зі старого "стартового" значення (див. "Програми" нижче).
- `training_schedule_history` — один рядок на кожен день, коли `users.trainingDays` реально змінився (`trainingDays` + `effectiveFrom`, unique по `(userId, effectiveFrom)` — повторна зміна того ж дня перезаписує рядок, а не плодить нові). Дає змогу календарю консистентності судити про минулі дати за розкладом, який діяв **тоді**, а не поточним (див. "Календар консистентності" нижче).

## Auth: життя токенів

Access-токен живе 15 хв (`JWT_ACCESS_TTL`), refresh — 30 днів (httpOnly cookie
`mygym_refresh`, `path=/api/auth`). Проблема, яку користувач ловив посеред
тренування: банер «Не вдалося зберегти» після ~15 хв — refresh не спрацьовував.

- **Фронтенд (`frontend/src/api/client.ts`)** тримає токен живим, поки вкладка
  відкрита: таймер оновлює його за 60 с до `exp`, а оскільки мобільні браузери
  заморожують таймери у фоні — ще й на `visibilitychange`/`focus`/`online`,
  якщо токен уже протух чи от-от протухне. Усі refresh (старт застосунку в
  `AuthContext`, таймер, повтор після 401) йдуть через ОДИН single-flight
  `refreshAccessToken()` — ротований refresh-токен ніколи не шлеться двічі
  паралельно (раніше StrictMode в dev слав два refresh на старті).
  Мережева помилка refresh токен НЕ скидає; лише справжній 401 від
  `/auth/refresh` → `setOnSessionLost` → `AuthContext` робить `setUser(null)`.
- **Gotcha: `Secure`-cookie по HTTP.** Раніше `secure` ставився за
  `NODE_ENV === 'production'`, а prod nginx — plain HTTP: браузер мовчки
  відкидає `Secure`-cookie, отриману по HTTP, тож refresh на проді не працював
  узагалі. Тепер `secure: request.protocol === 'https'` (Fastify
  `trustProxy` + `X-Forwarded-Proto` від nginx). З переходом проду на HTTPS
  (2026-10-21) прапорець `Secure` увімкнувся сам; у dev (HTTP) його нема.
- Cookie має `maxAge` (= `JWT_REFRESH_TTL`), а не сесійна — мобільний браузер
  губив сесійну cookie, коли вбивав фонову вкладку.
- **Grace-вікно ротації 60 с** (`ROTATION_GRACE_MS` у `auth.service.ts`): щойно
  відкликаний токен ще хвилину приймається повторно — на випадок, коли сервер
  ротував, а відповідь із новою cookie загубилась у поганій мережі в залі.
  Свідомий компроміс безпеки для особистого застосунку. Саме через це logout
  **видаляє** рядок `refresh_tokens`, а не ставить `revokedAt` — інакше grace
  дав би хвилину на повторне використання токена після виходу.

## Вхід через Google (`modules/auth/google.client.ts` + `auth.routes.ts`)

Серверний OAuth Authorization Code flow, а не кнопка Google Identity Services:
popup GIS погано працює у встановленому PWA, а так секрет лишається на
сервері й уся сесійна логіка вище (refresh-cookie, ротація) не змінюється.
- `GET /api/auth/google` → 302 на Google; `state` (CSRF) і PKCE-verifier — у
  cookie `mygym_google_flow` (`<state>.<verifier>`, httpOnly, `SameSite=Lax`,
  10 хв, `path=/api/auth/google`). Scopes лише `openid email`.
- `GET /api/auth/google/callback` — звіряє `state`, міняє код на ID-токен,
  `verifyIdToken` (підпис, `aud`). **Будь-який результат — редирект**: успіх →
  ставить звичайну `mygym_refresh` і `/` (SPA підхоплює своїм refresh на
  старті), помилка → `/login?error=<код>` (`errors.google_*` у словниках).
- `loginWithGoogle` (`auth.service.ts`): спершу за `googleSub`, інакше за email
  (без регістру) — **прив'язує Google до наявного акаунта і пароль лишається
  робочим** (рішення користувача 2026-10-21; свідомо прийнятий ризик: email при
  реєстрації паролем не підтверджується, тож теоретично хтось міг заздалегідь
  зайняти чужий email; щоб звузити його, прив'язка **видаляє всі
  refresh-токени** цього акаунта — хто був залогінений до прив'язки, вилітає),
  інакше створює новий акаунт без пароля з тими самими
  13 вправами (`createUserWithDefaults`, спільна з `registerUser`). Вимагає
  `email_verified`; email, уже прив'язаний до іншого Google ID →
  `google_account_mismatch`. Вхід паролем в акаунт без пароля → `use_google_login`.
- `GET /api/auth/providers` → `{ google }` — фронтенд (`GoogleSignInButton`)
  показує кнопку лише коли Google налаштований.
- Конфіг: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (разом або жодного;
  порожні = вимкнено, роути 404) і `GOOGLE_REDIRECT_URI` (dev — через проксі
  Vite: `http://localhost:5173/api/auth/google/callback`; прод —
  `https://<DOMAIN>/api/auth/google/callback`), має посимвольно збігатись з
  "Authorized redirect URIs" OAuth-клієнта (Google Cloud Console, проєкт MyGym,
  статус In production; логотип у Branding **не завантажувати** — тоді Google
  вимагає перевірку бренду).
  У production не-`https://` `GOOGLE_REDIRECT_URI` (напр. забутий dev-default)
  **вимикає** Google-вхід з попередженням у лозі, а не валить увесь бекенд.
  Email з Google приводиться до нижнього регістру, як і скрізь у `users`.
- `google-auth-library` зафіксовано на 10.x з часів Node 20 (11.x вимагає Node ≥22);
  з переходом на Node 24 можна оновити окремою задачею.
- Тести (`test/google-auth.test.ts`) мокають `google.client.ts` цілком — без мережі.
- `/privacy` (`PrivacyPage.tsx`, публічна) — на неї посилається consent screen Google.

## Персональні токени доступу (`modules/apiTokens/`, MCP, частина 1)

Довгоживучий токен `mygym_pat_<64 hex>` для програм, що діють від імені
користувача (MCP-сервер, Claude Code) — без браузерного refresh-flow.
- `authenticate.ts`: `Bearer mygym_pat_…` → пошук активного токена за sha256
  (`findUserByApiToken`), інакше JWT як раніше. `request.authMethod` =
  `'pat'` | `'session'`. Решта API нічого не помічає — ізоляція даних та сама
  (`request.userId`).
- `/api/tokens`: `GET` (метадані, без хешу), `POST {name}` (сирий токен
  повертається **один раз**; максимум 20 активних — `too_many_tokens`),
  `DELETE /:id` (`revokedAt`; чужий → 404).
- **`/api/tokens` приймає лише сесію, не PAT** (`403 session_required`):
  інакше злитий токен міг би сам наробити собі нових вічних токенів, і
  відкликання первинного нічого б не дало.
- Без терміну дії (живе до відкликання) — свідомий компроміс з TASK. Видалення
  користувача каскадить токени.
- `lastUsedAt` пишеться не частіше раз на хвилину на токен (умовний UPDATE),
  щоб кожен MCP-виклик не був ще й записом у БД.
- UI: `/integrations` (`IntegrationsPage.tsx`, пункт у меню профілю й
  мобільному меню) — створення з назвою, одноразовий показ токена, список,
  відкликання (помилку відкликання показує явно). Сирий токен не лишається в
  кеші TanStack: мутація створення з `gcTime: 0` + `reset()` на «Готово».
  Картка нового токена показує готову команду `claude mcp add --transport http
  mygym <origin>/mcp --header …` (див. "MCP-сервер" нижче).
  Сторінка (редизайн за макетом «MyGym — Інтеграції», 2026-10-22): картка з
  адресою `<origin>/mcp` → вкладки інструкцій Claude / ChatGPT / Claude Code
  (кількість кроків і порад — константа `GUIDES`, тексти — `integrations.guide.*`
  у словниках, розмітка через `<Trans>`) → «Підключені застосунки» → «Токени
  доступу». **Gotcha:** `<Trans>` розбирає `<ТОКЕН>` у тексті як тег і мовчки
  його з'їдає — плейсхолдер і адреса сервера передаються окремими компонентами
  (`<token/>`, `<url/>`), не текстом словника.
- Ліміт 20 рахується в транзакції з `SELECT … FOR UPDATE` рядка `users` —
  інакше паралельні POST-и проходили б перевірку разом.
- Тести: `test/api-tokens.test.ts` (зокрема ізоляція двох користувачів через PAT).

## MCP-сервер (`mcp-server/`, MCP, частина 2)

Окремий пакет (Node 24 + TS, `@modelcontextprotocol/sdk` 1.32, **Fastify** —
як бекенд, а не Express із прикладів SDK), через який Claude керує MyGym.
**Тонкий stateless-проксі без бізнес-логіки й без токенів:**
- `POST /mcp` — на **кожен** запит новий `McpServer` + `StreamableHTTPServerTransport`
  (`sessionIdGenerator: undefined`, `enableJsonResponse: true`) + `apiClient` з
  `Authorization` саме цього запиту → пересилається в бекенд без перевірки
  (вирішує бекенд — PAT вище). Ніколи не тримати сервер/клієнт між запитами:
  інструменти «запам'ятали б» токен першого користувача (тест ізоляції це ловить —
  перевірено навмисною поломкою). Без `Bearer` → 401; `GET/DELETE /mcp` → 405;
  `GET /health`. Єдиний конфіг — `MYGYM_API_URL`, `PORT` (8080).
- 12 інструментів (`src/tools/*.ts`): вправи (list/create), тренування
  (list/get/start/finish, `log_workout_exercises`), програми (list/create/suggested),
  прогрес (overview, history). Схеми входу дзеркалять бекенд **разом із
  `z.coerce.number()`**: `numeric`-колонки (`weightPerUnitKg`) Drizzle віддає
  рядком `"22.50"`, і Claude передає їх назад як є — з `z.number()` перша спроба
  `log_workout_exercises` після `get_workout` падала б. Відповідь — JSON
  бекенду як є; помилки → `isError` з текстом, з яким Claude може щось зробити
  (`tools/result.ts`: 401 → «токен відкликано, створіть новий в Інтеграціях»).
- **`log_workout_exercises` = `PUT …/exercises`, що ЗАМІНЮЄ весь список** (на цьому
  стоїть автозбереження форми). Рішення користувача (2026-10-21): бекенд не чіпати,
  а в описі інструмента прямо написати «REPLACES ALL… спершу get_workout». Додати
  merge-ендпоінт у бекенд — якщо колись Claude таки зітре вправи.
- Видалення через MCP свідомо нема — деструктивне лишається в UI.
- Ліміт 60 запитів/хв на токен (ключ — sha256 заголовка). **Gotcha:** роути мусять
  бути всередині `app.register(...)` — оголошені на корені додаються до того, як
  `@fastify/rate-limit` завантажився, і `config.rateLimit` тихо не діє (так і було,
  зловив тест).
- Запит до бекенду з таймаутом 15 с; помилка після `reply.hijack()` закриває
  відповідь сама (500 JSON-RPC) — Fastify після hijack цього вже не робить.
- Docker: сервіс `mcp` у `docker-compose.yml` (образ працює від `USER node`) (nginx `/mcp` → `mcp:8080` через
  `resolver` — з етапу HTTPS); у dev — `mcp` на `:8080` з hot-reload, і Vite
  проксить `^/mcp(/|$)` туди ж (регекс, як у nginx — щоб не ковтати SPA-маршрути
  `/mcp-…`), тож `<origin>/mcp` однаковий у dev і проді.
- Тести (`mcp-server/test/mcp.test.ts`, `npm test` у `mcp-server/`): справжній
  SDK-клієнт проти фейкового бекенду, що відповідає кожному токену своїми даними.
- Підключення: claude.ai / Desktop / телефон / ChatGPT — Add custom connector →
  URL `https://<домен>/mcp` → **Sign in** (OAuth, див. нижче; у Claude — «Use
  Claude's published identity», client ID не потрібен). Claude Code — `claude mcp
  add --transport http mygym https://<домен>/mcp --header "Authorization: Bearer
  mygym_pat_…"` (OAuth без `--header` спрацює, лише якщо Claude Code
  проходить CIMD або DCR — не перевірено). Gemini — через «Sign in» (DCR). PAT у полі
  Request headers конектора (Authentication **No sign-in**) теж працює. Значення
  заголовка форма не показує повторно — при «токен відхилено» перевірити токен
  окремо (`Invoke-RestMethod …/api/workouts -Headers @{Authorization="Bearer …"}`);
  першою причиною колись виявився dev-токен у прод-конекторі.
- **401 з `WWW-Authenticate`:** без `Bearer` або з токеном, який API відхиляє
  (перевірка `GET /api/settings` на **кожен** запит — без кешу: кешоване
  «прийнято» після протухання OAuth-токена давало б `isError` у 200 замість 401,
  і клієнт не робив би refresh; знахідка рев'ю), MCP-сервер відповідає справжнім HTTP 401 з `Bearer
  resource_metadata="<PUBLIC_URL>/.well-known/oauth-protected-resource/mcp"`.
  Саме на 401 (а не на `isError` у 200) Claude/ChatGPT вмикають «Sign in» і
  оновлюють протухлий OAuth-токен. API недоступне → запит пропускається
  (інструменти скажуть «could not reach»), щоб не просити зайвий раз увійти.
  Конфіг — `PUBLIC_URL` (compose: `https://${DOMAIN}`, dev: `http://localhost:5173`).
- **Gotcha (поза MCP, знайдено при e2e):** користувача з тренуваннями не можна
  видалити (`DELETE FROM users`) — каскад іде в `exercises`, а
  `workout_exercises.exerciseId` має `restrict`. Тести не ловлять, бо
  `TRUNCATE … CASCADE`. Виправити перед фічею «видалити акаунт».

## OAuth для MCP-клієнтів (`modules/oauth/`, MCP, частина 3)

MyGym — власний OAuth authorization server для MCP (специфікація MCP
2026-07-28), щоб Claude і ChatGPT підключались через «Sign in» без копіювання
токена. Рішення користувача (2026-10-21): MCP і REST API — **один ресурс**
(OAuth-токен для `<PUBLIC_URL>/mcp` приймає й API); клієнти — через CIMD
з allow-list хостів (Claude, ChatGPT) **або DCR** (з 2026-10-22, для Gemini й
інших без CIMD, див. нижче); access 1 год, refresh 30 днів з ротацією **без
grace-вікна** — повтор старого refresh відкликає весь grant (на відміну від
сесійного refresh вище; ціна — рідкісне «відключилось само» після загубленої
відповіді).
- Discovery (`wellKnown.routes.ts`, на корені, CORS `*`):
  `/.well-known/oauth-authorization-server` (RFC 8414; без
  `client_id_metadata_document_supported` + `"none"` у
  `token_endpoint_auth_methods_supported` Claude не бере CIMD, без
  `authorization_response_iss_parameter_supported` ChatGPT не бере стабільний
  redirect) і `/.well-known/oauth-protected-resource[/mcp]` (RFC 9728). nginx і
  Vite проксять їх (і `openid-configuration` → чесний 404 замість index.html) у
  бекенд; решта `/.well-known` (ACME) — як раніше.
- **CIMD** (`cimd.client.ts`): `client_id` = https-URL без порту на хості з
  `OAUTH_CLIENT_HOSTS` (default `claude.ai,claude.com,chatgpt.com`); документ
  тягнеться без редиректів, 5 с, ≤5 КБ, кеш за Cache-Control (помилки не
  кешуються); `redirect_uris` лише https або loopback http. Redirect — точний
  збіг, для loopback (Claude Code) порт ігнорується (RFC 8252). Claude:
  `https://claude.ai/oauth/mcp-oauth-client-metadata`, ChatGPT:
  `https://chatgpt.com/oauth/client.json`. Тести мокають лише `resolveClient`.
- **DCR** (RFC 7591, `dcr.service.ts`, `POST /api/oauth/register`, у discovery
  `registration_endpoint`): реєстрація **відкрита** (рішення користувача
  2026-10-22) — `redirect_uris` будь-які https або loopback http (як у CIMD,
  плюс без `#` і `*`), 10/год на IP. Видає `client_id` = `mygym_cli_<32 hex>`
  (так CIMD і DCR розрізняються: `isRegisteredClientId` = не `https://`) і, крім
  `token_endpoint_auth_method: none`, секрет `mygym_cls_…` — показується раз, у
  `oauth_clients` лише sha256. Default методу — `client_secret_basic` (RFC 7591).
  `/token` перевіряє секрет із тіла або Basic (обидва разом → `invalid_request`;
  невірний → 401 `invalid_client`, з Basic — ще `WWW-Authenticate`), до
  транзакції — невдала спроба код не спалює. Невідомі `grant_types` ігноруються.
  Клієнти, що 30 днів ні разу не підключились (нема grant-а й запиту на
  згоду), видаляються при наступній реєстрації.
  Зареєстрований клієнт **нічого не доводить про себе**: згода показує його як
  неперевірений (`verified: false`, `clientHost: null`, жовте попередження під
  назвою + хост redirect-а), `logo_uri` не береться, favicon не проксіюється
  (лише літера). **Помилки `/authorize` для нього — завжди на НАШІЙ сторінці**,
  навіть після успішної валідації redirect-а: інакше будь-хто реєструє свій
  redirect і має відкритий редирект з нашого домену без входу (знахідка рев'ю).
  **Gotcha:** код, що розбирає `clientId` як URL (`new URL(grant.clientId)`),
  на DCR-клієнті кидає виняток — так після підключення Gemini «Інтеграції»
  рендерились порожніми (2026-10-22, PR #25). Перевіряти `startsWith('https://')`.
- `GET /api/oauth/authorize` → запит у БД → 302 на `/oauth/consent?request=<id>`
  (SPA, `OAuthConsentPage.tsx`, сама веде на login з `?next=`). PKCE S256
  обов'язковий, `resource` = `<PUBLIC_URL>/mcp`, scope лише `mygym`, кожен
  редирект з `iss` (RFC 9207). Невідомий клієнт / чужий redirect → помилка на
  НАШІЙ сторінці (`?error=`), ніколи не редирект туди. Повторений параметр →
  `invalid_request`.
- **Прив'язка до браузера:** `/authorize` ставить httpOnly cookie
  `mygym_oauth_browser` (`path=/api/oauth`, Lax, 10 хв, одна на браузер — кілька
  паралельних запитів працюють), її хеш — у запиті; без неї API згоди віддає 404.
  Інакше атакер почав би підключення у своєму Claude і надіслав посилання на
  згоду жертві (знахідка рев'ю).
- API згоди (`/requests/:id`, `/requests/:id/decision`, `/grants`) — лише сесія
  (`requireSession`), не PAT/OAuth-токен: токен не схвалить сам собі ще доступу.
- `POST /api/oauth/token` (form-urlencoded, `@fastify/formbody`): код одноразовий
  (атомарний claim у транзакції), `mygym_oat_…` лежить у `api_tokens` (тому
  `authenticate.ts` і ізоляція даних ті самі, `authMethod = 'pat'`),
  `mygym_ort_…` — у `oauth_refresh_tokens`. Прострочені рядки прибираються при
  видачі нових. `/api/tokens` OAuth-токенів не показує й не рахує в ліміт 20.
- Повернення після входу: `?next=` на login/register/Google (`utils/safeNext.ts`,
  дзеркало на фронтенді). Відкидає `//`, `\`, пробіли й керівні символи —
  браузер викидає TAB/LF з URL, і `/<TAB>/evil.com` ставав би `//evil.com`.
  Google тримає `next` у cookie `mygym_google_next` на час походу до Google.
- `PUBLIC_URL` (бекенд і MCP-сервер; compose `https://${DOMAIN}`) — issuer і
  ресурс мусять посимвольно збігатися з тим, що бачить клієнт; не-https у
  production → попередження в лозі.
- «Інтеграції» → «Підключені застосунки»: список grant-ів, «Відключити»
  відкликає grant і всі його токени одразу.
- **Іконка застосунку** (`ClientIcon` в `IntegrationsPage.tsx`, логотипів у
  бандлі нема): `logoUri` grant-а (браузер вантажить напряму, `no-referrer`) →
  favicon через проксі → перша літера `clientName`. `logo_uri` з CIMD
  (`safeLogoUri`: лише https без credentials, ≤2048; битий тихо стає `null`, не
  ламає клієнта); grant-и, створені до 2026-10-22, його не мають до перепідключення.
  Проксі `GET /api/oauth/client-icon?client_id=` (`clientIcon.client.ts` +
  `clientIcon.service.ts`): **публічний** (`<img>` не шле Bearer), лише хости з
  `OAUTH_CLIENT_HOSTS` через `parseClientIdUrl` (SSRF), лише
  `https://<host>/favicon.ico` без редиректів, лише растрові типи — **SVG ні**
  (відкритий напряму з нашого origin виконав би скрипти), ≤100 КБ з обривом
  читання, `nosniff` + CSP `default-src 'none'`; кеш у пам'яті за хостом 24 год,
  промах 1 год. Logo_uri через сервер свідомо не проксіюється — його хост
  довільний. **Gotcha:** chatgpt.com відповідає 403 на будь-який серверний
  запит (Cloudflare, від User-Agent не залежить) — для ChatGPT працює лише його
  `logo_uri`; обходити не треба.
- Тести: `test/oauth.test.ts` (повний потік, PKCE, повтор refresh, прив'язка до
  браузера), `test/oauth-cimd.test.ts`, `test/oauth-dcr.test.ts`.

## Захист API та тести

- **Rate limit** (`@fastify/rate-limit`, `global: false`): лише `/api/auth/login`
  (10/хв), `/api/auth/register` (5/15 хв) і обидва Google-роути (20/хв) на IP —
  константи `LOGIN_RATE_LIMIT`/`REGISTER_RATE_LIMIT`/`GOOGLE_RATE_LIMIT` в `auth.routes.ts`. `/refresh` свідомо без ліміту — його
  смикає кожна відкрита вкладка (таймер, `visibilitychange`). OAuth:
  `/api/oauth/register` 10/год, `/api/oauth/authorize` 30/хв, `/api/oauth/token` і `/api/oauth/client-icon`
  60/хв на IP (`AUTHORIZE_RATE_LIMIT`/`TOKEN_RATE_LIMIT`/`CLIENT_ICON_RATE_LIMIT`
  в `oauth.routes.ts`).
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
  13 вправ в одній транзакції; гонка двох реєстрацій з одним email ловиться
  через unique violation (`23505`) → `email_taken`, а не 500.
- **Тести** — `backend/test/`, `npm test` (Vitest). Інтеграційні через
  `app.inject()` проти справжнього Postgres (міграції застосовуються в
  `test/globalSetup.ts`; між тестами `TRUNCATE users CASCADE`, тому назва БД
  мусить містити `test` — інакше запуск падає). Правила прогресії винесені в
  чисті функції `suggestProgression`/`buildHistoryPoints` саме заради юніт-тестів.
  Свіжий `buildApp()` на кожен тест = свіже in-memory сховище rate limit.
- **CI** (`.github/workflows/deploy.yml`): `backend-test` (typecheck + тести з
  postgres-сервісом), `frontend-build` і `mcp-server-test` на кожен push/PR;
  `deploy` — тільки push у `main` і тільки після всіх трьох зелених джобів.

## Логіка прогресії (backend/src/modules/progression/progression.service.ts)

Категорії вправ і їх правила (задані користувачем на основі реального досвіду
тренувань, включно з травмою правого плеча):

| Категорія | Приклади | Повторення | Крок ваги |
|---|---|---|---|
| `large` (велика група) | присідання, станова, жим лежачи, тяга в нахилі, випади | 6-15 | +1.25 кг з кожного боку |
| `small` (мала група) | біцепс, французький жим, розведення (нахил/стоячи), **жим стоячи** (навмисно тут, а не у великих — травма плеча) | 6-20 | +0.5 кг з кожного боку |
| `bodyweight` (без ваги) | віджимання (до 30 повт.), підняття ніг/корпусу на прес (до 30 повт.) | 6-30 | коли досягнуто макс. повторень без ваги → підказка почати додавати обтяження (диск на спину, обтяження для ніг — користувач планує купити) |

Правила нагадування:
- Досягнуто верхньої межі діапазону повторень на всіх підходах → підказка додати вагу (`increase_weight` / `start_adding_weight`).
- 14+ днів без прогресу → м'яке нагадування `try_more`. **Прогрес** (`findLastProgress`,
  з 2026-10-23, рішення користувача) = обсяг сесії більший за попередню
  (`вага × сума повторень усіх підходів`; без ваги **або з вагою 0** — сума
  повторень) **або** зросла вага (зокрема поява ваги після «без ваги»). Тобто
  доданий підхід теж скидає лічильник. Обсяги порівнюються лише між двома
  сесіями одного типу (обидві з вагою / обидві без) — кг×повт проти повт
  безглуздо, тож забута вага не дає ні прогресу, ні скидання. Раніше було
  «вага чи макс. повторень».
  Якщо для вправи в програмі задано N, правило за днями
  замінюється правилом за **тренуваннями**: `try_more` після N сесій цієї вправи
  без прогресу (`sessionsSinceProgress`) — пропущені дні
  розкладу лічильник не збільшують і не скидають. N =
  `program_exercises.tryMoreAfterWorkouts` (поріг вправи) ?? `programs.tryMoreAfterWorkouts`
  (для всіх вправ програми) ?? правило 14 днів; вправа в кількох програмах →
  береться найменше N. Фронтенд будує текст підказки за днями чи сесіями
  (`utils/progressionMessage.ts`).
- **Ручний зсув лічильника** (повзунок у формі програми): `exercises.tryMoreCounterAdjust`
  + `tryMoreCounterAnchor` (дата останнього прогресу на момент збереження).
  `applyCounterShift` додає зсув до `sessionsSinceProgress` (не нижче 0), **лише
  поки останній прогрес — той самий** (дата = якір): наступний справжній прогрес
  починає відлік з нуля, а зсув зникає сам; історію тренувань ніщо не змінює.
  Зсув — на вправі, а не в програмі: лічильник один на вправу, спільний для всіх
  програм (і для нагадувань у журналі). Пишеться через `PUT/POST /api/programs`,
  поле `exercises[].sessionsDone` (0–60, «лічильник має показувати стільки зараз»;
  без поля — не чіпати): `computeCounterShift` рахує зсув від сирого лічильника,
  тож повторне збереження ідемпотентне; збіг із сирим → зсув 0, якір `null`;
  вправа без історії → ігнорується. Читає історію через `tx` транзакції збереження.
  Вправу прибрали з усіх програм → зсув лишається й оживе, якщо повернути її без
  прогресу між тим (свідомо, не баг).
- **UI (`ProgramsPage.tsx`):** у формі біля кожної вправи — поле порогу N (порожньо/0 =
  як у програмі) і повзунок 0…N «Вже пройшло без прогресу: X / N» (назад — відкласти,
  вперед — наблизити; «Скасувати» повертає справжнє значення). Надсилається лише
  зрушений повзунок, затиснутий до N, і не надсилається, коли порогу нема (повзунок
  неактивний). Жовте попередження, коли інша програма з цією вправою має менше N
  (бекенд бере мінімум). На картці програми — відлік для кожної вправи зі смужкою
  (`utils/tryMoreCountdown.ts`: за порогом ЦІЄЇ програми, а без нього — за
  `tryMoreAfterWorkouts` з overview, щоб не показати «пора», коли бекенд мовчить;
  вправа, якої нема в overview (архівна), — без статусу). Мутації збереження/завершення
  тренування і програм інвалідують `progressionKeys`, інакше відлік застарівав би
  (`staleTime` 30 хв).
- Ручне збільшення повторень/ваги завжди дозволене поза розкладом (м'язи можуть адаптуватись швидше за графік).

**Розширена аналітика (`HistoryPoint`, `GET /api/progression/:exerciseId/history`):**
крім `totalWeightKg`/`maxReps`/`avgReps`/`setsCount` тепер рахує (в `buildHistory`):
- `estimatedOneRepMaxKg` — 1ПМ за формулою Epley (`вага × (1 + повт/30)`, округлено до 0.1),
  `null` якщо вправа без ваги. Ненадійна на 15+ повтореннях — свідомо не приховується,
  графік просто показує тренд.
- `volumeKg` (`вага × сума повторень усіх підходів`) + `totalReps` — для безвагових
  вправ `volumeKg = null`, фронтенд перемикається на `totalReps` як "обсяг".
- `isWeightPR` / `isRepsPR` — true, коли значення точки строго більше за всі
  попередні хронологічно (running max, рахується в тому ж проході `buildHistory`).
  Рендериться на графіку як більша точка + рядок "🏆 Особистий рекорд" у тултипі
  (`components/ProgressChart.tsx`, кастомний `dot`-рендерер і `content` для Tooltip).
- `GET /api/progression/volume-by-category?weeks=12` — сума обсягу по
  (ISO-тиждень, категорія вправи) за N тижнів, для `WeeklyCategoryChart.tsx`
  (згрупований, не stacked, barchart) на сторінці "Прогрес" — баланс великих/малих
  груп. **Увага:** категорія `bodyweight` у цьому графіку в повтореннях, а
  `large`/`small` — у кг ваго-обсягу; змішані одиниці на одній осі — свідомий
  компроміс з ТЗ, не помилка.
- **Gotcha:** Recharts `<Line>` за замовчуванням анімує "малювання" лінії через
  `strokeDasharray`, і в цьому проєкті анімація стабільно застрягала на першому
  кадрі (лінія невидима, хоч шлях у SVG правильний) — виправлено `isAnimationActive={false}`
  на всіх `<Line>`/`<Bar>` в `ProgressChart.tsx`/`WeeklyCategoryChart.tsx`.

**Календар консистентності** (`components/ConsistencyCalendar.tsx`, на журналі
над списком тренувань) — сітка тижні×дні (16 тижнів, GitHub-style) на основі
`GET /api/settings/history` (повна історія `training_schedule_history`,
відсортована за `effectiveFrom`) + `GET /api/workouts/dates?from&to` (легкий
ендпоінт: лише дата + мітка + назви вправ, без повного payload). Для кожної
дати клітинки береться розклад із **останнього** запису історії з
`effectiveFrom <= дата` (`scheduleOn()` на фронтенді) — тобто минулі дати
оцінюються за розкладом, який діяв тоді, а не поточним. 4 стани:
`trained_planned` (зелений), `trained_extra` (синій, бонусне тренування поза
розкладом), `missed_planned` (червоний, тільки для минулих дат), `rest`
(нейтральний). **Сьогодні завжди нейтральне**, навіть якщо це плановий день і
ще не залоговано (день ще не завершився). Hover-tooltip на клітинці — дата +
вправи; контейнер навмисно БЕЗ `overflow-x-auto` (сітка й так вміщується) —
з ним CSS змушує `overflow-y` теж стати `auto`, і tooltip обрізається зверху.

**`PATCH /api/settings`** — часткове оновлення (`trainingDays`, `trainingTime`,
`trainingDurationMin`, `timezone`; хоча б одне поле, інакше 400). Якщо в тілі є
`trainingDays`, додатково апсертить рядок
`training_schedule_history` на сьогоднішню дату (одна зміна на день —
повторний виклик того ж дня оновлює той самий рядок). Реєстрація нового
користувача засіює перший рядок історії одразу (`auth.service.ts`), інакше
календар не мав би чим оцінити дати до першої ручної зміни розкладу.

**Gotcha (бекфіл при міграції):** початковий бекфіл історії для існуючих
користувачів брав `users.createdAt` як `effectiveFrom` — це неправильно для
акаунтів з CSV-імпортованою історією тренувань, що передує самому рядку
`users` у цій БД (реальні тренування з липня, акаунт створений у вересні).
Виправлено окремою міграцією: `effectiveFrom` підтягнутий до дати
**найранішого тренування** користувача, якщо вона раніша.

## Календарний фід (`modules/calendar/`)

Підписка на розклад тренувань у Google / Apple / Outlook Calendar через
секретне посилання на ICS-фід (блок «Нагадування в календарі» у картці розкладу
на сторінці «Вправи», `components/CalendarSubscription.tsx`).
- Налаштування в `users`: `trainingTime` (`HH:MM`, default `18:00`),
  `trainingDurationMin` (60), `timezone` (IANA, default `Europe/Kyiv`). Пояс у
  формі не показується: фронтенд додає пояс браузера до кожного збереження
  розкладу, якщо він інший (і перед підключенням календаря).
- Токен `mygym_cal_<64 hex>` (`utils/tokens.ts`), у БД лише sha256
  (`users.calendarFeedTokenHash`, один фід на користувача). Посилання
  показується **один раз** (як PAT; мутація з `gcTime: 0`); далі лише
  «Нове посилання» (старе одразу 404) і «Відключити».
- `POST/DELETE /api/calendar/token` — **лише сесія** (`requireSession`): злитий
  PAT не повинен випускати собі секретні посилання. `POST {lang}` повертає
  `feedUrl`, `webcalUrl`, `googleUrl` (`calendar.google.com/calendar/r?cid=<webcal>`),
  усі від `PUBLIC_URL`; мова назви події — у URL як `?lang=en|uk` (Google тягне
  фід зі своїх серверів, `Accept-Language` там не користувача).
- `GET /api/calendar/feed/<token>.ics` — публічний; битий/невідомий токен → 404
  (не 401). Rate limit 60/год **за файлом**, а не за IP: Google тягне всі
  підписки зі спільного пулу своїх адрес.
- ICS (`calendar.ics.ts`, `ical-generator` 11 + `@touch4it/ical-timezones` для
  `VTIMEZONE`): **одна щотижнева серія на рядок `training_schedule_history`**
  (`RRULE BYDAY`, `UNTIL` = остання секунда перед `effectiveFrom` наступного
  рядка, в UTC), тож минулі тижні показують тодішній розклад; час і тривалість —
  поточні для всіх серій. `UID` = `schedule-<effectiveFrom>-<userId>@mygym`
  (стабільний — оновлення, а не дублі). `VALARM` за 30 хв, `REFRESH-INTERVAL` 6 год.
- **Gotcha:** `ical-generator` форматує нативний `Date` **локальним годинником
  процесу**, а не за `TZID` — у UTC-контейнері всі тренування з'їжджали на
  зсув поясу (на хості з київським поясом баг не видно). Тому дати — Luxon
  `DateTime` у поясі користувача. Тести (`test/calendar.test.ts`) парсять фід
  `node-ical` і звіряють справжні UTC-моменти (літо/зима).
- **Gotcha:** пакет VTIMEZONE знає лише стару назву `Europe/Kiev` — для
  `Europe/Kyiv` аліас (`VTIMEZONE_ALIASES`), TZID і VTIMEZONE завжди однакові;
  невідомий пояс → фід без VTIMEZONE (клієнти розуміють IANA-назву самі).
  Для `Etc/GMT±N` VTIMEZONE **свідомо не генерується**: у пакеті знак офсету
  перевернутий (`Etc/GMT+5` виходить +05:00, а це UTC−5) — Apple/Outlook зсунули б
  події на 2N год (знахідка рев'ю).
- `timezone` у PATCH приводиться до написання рантайму (`america/new_york` →
  `America/New_York`); сирі офсети (`+05:00`) відкидаються — у `TZID` клієнти їх
  не розуміють. Якщо сервер не знає пояс браузера (новіші tzdata), фронтенд
  повторює збереження без `timezone`, щоб це не блокувало зміну розкладу.
- Час старту, що потрапляє в «дірку» переходу на літній час (03:30 у день
  переходу), — перший такий день пропускається: `DTSTART` задає настінний час
  усій серії, і Luxon-овий зсув на 04:30 зсунув би всі події.
- Секрет фіда — у шляху URL. У логах бекенду він маскується (серіалізатор `req`
  в `app.ts`), але **access-лог nginx його містить** — свідомий компроміс: фід
  лише для читання і містить тільки розклад.
- Обмеження Google (показані підказкою в UI): оновлює підписки із затримкою до
  доби і ігнорує `VALARM` (бере свої налаштування нагадувань).
- Фід віддає зміни розкладу одразу, але календарі тягнуть його за своїм
  розкладом — повторне «Додати в Google Calendar» з тим самим посиланням
  показує кешовану Google копію (скарга користувача 2026-10-22, не баг). Тому
  при підключеному календарі успішна зміна днів/часу/тривалості показує під
  полями `exercises.calendar.updateDelay` (Google — до доби, Apple/Outlook — кілька годин).

## CSV-імпорт (backend/src/modules/import/)

Імпортує експорт з Google Таблиць користувача — **позиційний парсинг**, не за
текстом заголовків (в оригінальній таблиці є типо "бфципс" замість "біцепс" —
тому матчинг іде за фіксованим порядком колонок, див. `importColumns.ts`).

Формат таблиці:
- Дата вказана тільки в рядку "підхід 1"; наступні підходи того самого дня — без дати.
- Кожна вправа — пара колонок (повторення, вага), крім безвагових вправ.
- Вага у форматі `2*20` = по 20 кг на кожну сторону/гантель (без урахування ваги грифа/гантелі).
- Повторний імпорт того ж файлу безпечний — тренування з датою, яка вже є в базі, пропускаються.

Перевірено на реальному файлі користувача (вересень 2026): 12 тренувань, 154
підходи, 0 нових вправ (усі 13 стандартних співпали), 0 пропущених рядків.

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

**Прод: HTTPS** (з 2026-10-21): https://my-gym-com.duckdns.org, VPS
`91.232.30.91`, репозиторій на сервері — `/root/MyGym`.
- nginx-конфіг — шаблон `nginx/templates/default.conf.template`, офіційний
  образ nginx підставляє `${DOMAIN}` через envsubst при старті. HTTP (і голий
  IP) → 301 на `https://${DOMAIN}` (не `$host` — інакше IP потрапляв би на
  чужий сертифікат); на 80-му лишається лише ACME webroot.
- `DOMAIN`/`CERTBOT_EMAIL` — лише в серверному `.env`; у compose `DOMAIN` через
  `${DOMAIN:?}` — без нього деплой падає червоним, а не крутить nginx у рестартах.
- Перший сертифікат — `scripts/init-letsencrypt.sh` (certbot `--standalone`,
  nginx на хвилину зупиняється; `STAGING=1` — пробний прогін, наступний
  звичайний запуск сам замінює staging-сертифікат). Поновлення — сервіс
  `certbot` (`renew --webroot` двічі на добу), nginx перечитує конфіг раз на 6 год.
  Скрипт читає з `.env` лише дві змінні через `grep`, не `. ./.env` (синтаксис
  Compose ≠ shell).
- **Усі upstream-и** (`backend`, `frontend`, `mcp`) — через `resolver 127.0.0.11`
  + змінну в `proxy_pass`, тобто DNS на кожен запит. **Gotcha:** зі статичним
  `proxy_pass http://frontend:80` деплой, що перестворив контейнер (нова IP),
  лишив nginx зі старою адресою — 502 на весь сайт до `docker compose restart
  nginx` (2026-10-21, після merge PR #13). Заодно nginx стартує й без
  якогось контейнера.
- HSTS навмисно `max-age=86400` — підняти до року, коли HTTPS стабільний.
- **Gotcha:** nginx рендерить конфіг із `nginx/templates` лише при старті
  контейнера, а `docker compose up -d` не перестворює його через зміну
  примонтованого файлу (і перечитування раз на 6 год бере старий готовий
  конфіг). Тому `deploy.yml` робить `restart nginx`, якщо між старим і новим
  HEAD змінилось щось у `nginx/` (після PR #14 `/.well-known` віддавав SPA до
  ручного рестарту).
- Відома прогалина: `deploy.yml` не перевіряє, що контейнери реально
  піднялись (`docker compose up -d` зелений і при nginx у циклі рестартів).

Перевірено реальний підйом dev-стека (`docker compose -f docker-compose.dev.yml
up --build`) на машині користувача (Windows + Docker Desktop): postgres,
backend, frontend піднімаються і відповідають на health-check.

Журнал тренувань (Dashboard) використовує класичну пагінацію зі сторінками:
`GET /api/workouts?page=&pageSize=` повертає `{ data, total, page, pageSize,
totalPages }` (offset-запит + `count()` в одному запиті), фронтенд —
`useWorkoutsQuery` + компонент `components/Pagination.tsx` (номери сторінок,
prev/next). Без цього старі імпортовані тренування були непомітні в UI —
раніше показувались лише останні 20 записів без способу побачити решту.
Номер сторінки живе в URL (`?page=N` через `useSearchParams`), не в
локальному `useState`, — інакше перехід на сторінку тренування і назад
скидав журнал на першу сторінку (`DashboardPage` розмонтовується при
переході на `/workouts/:id`).

**Автозбереження тренування (`WorkoutFormPage.tsx`):** користувач не хотів
щоразу тиснути «Зберегти» посеред тренування. Повторення й вага
зберігаються на `blur` поля; додати/прибрати підхід чи вправу і зміна
одиниць — одразу; вихід зі сторінки (навбар, «назад») з незбереженою
правкою теж зберігає (cleanup-ефект при unmount). Кнопка «Зберегти»
лишилась — під час збереження на ній спінер + «Зберігаємо…», неактивна,
коли незбережених змін нема.
- **Збереження строго послідовні** (`flushSave`: один цикл + прапорець
  `pendingSaveRef`). `PUT /api/workouts/:id/exercises` перезаписує ВСІ вправи
  тренування (delete + insert в одній транзакції), тож два паралельні запити
  могли б переплестись і задублювати підходи. Правка під час збереження
  лише ставить прапорець — цикл після поточного збереження зберігає ще раз
  з найсвіжішим станом (`blocksRef`).
- Тригер — лічильник `saveTick` + `useEffect`, а не прямий виклик з
  обробника: структурна зміна робить `setBlocks` + `requestSave()`, і ефект
  виконується вже після рендеру, коли `blocksRef` містить нову правку.
- Вправа без жодного заповненого повторення (щойно додана) — автозбереження
  її **мовчки пропускає** і чекає; помилку `workout.emptySetError` показує
  лише явне натискання «Зберегти» / «Завершити».
- Банер «Не вдалося зберегти» сам зникає після наступного успішного
  збереження.

**Шаблони тренувань (чергування програм А/Б):** користувач тренується за
чергуванням (напр. програма А і програма Б через раз), і не хотів щоразу
вручну додавати одні й ті самі вправи. Реалізовано через `workouts.programLabel`
(довільний текст, не enum — юзер сам вирішує назви):
- `PATCH /api/workouts/:id` — виставити/змінити мітку на будь-якому тренуванні
  (поле «Мітка» на `WorkoutFormPage`, під датою).
- `GET /api/workouts/templates` — по одному найновішому тренуванню на кожну
  унікальну мітку користувача (дата + перелік назв вправ, для прев'ю).
- `POST /api/workouts` приймає `{ programLabel?, copyFromWorkoutId? }` — копіює
  вправи+ваги (**без підходів** — повторення щоразу нові) з вказаного
  тренування в межах однієї транзакції.
- Dashboard: кнопка «+ Нове тренування» — `components/NewWorkoutButton.tsx`,
  спливне меню «Порожнє» + по одній опції на мітку (з датою й превʼю вправ).
  Меню не показується, якщо міток ще нема (одразу порожнє тренування).
- Кольорове кодування карток у журналі — `utils/labelColor.ts`: детермінований
  хеш мітки → колір з палітри (sky/amber/violet/emerald/rose/cyan), однакова
  мітка завжди отримує той самий колір. Не хардкод на «А»/«Б» — працює для
  будь-якої кількості довільних міток.
- Фактичне правило користувача (вересень 2026): тренування зі становою тягою
  без присідань = А, з присіданнями без станової = Б. Застосовано ретроактивно
  до існуючих даних (24 тренування однозначно розмічені). **9 тренувань
  01–17.07.2026 мають і станову, і присідання одночасно** (інша структура
  програми на той момент, ще без A/Б-спліту) — свідомо лишені без мітки,
  бо правило для них неоднозначне.
- **Gotcha:** `startWorkout` — транзакційний; читати щойно вставлений рядок
  назад треба через `tx.query`, а не через звичайний `db`/`getWorkout()` —
  інакше читаєш ще не закомічені дані з окремого з'єднання й отримуєш
  `undefined` (спіймано й виправлено під час реалізації).

**Програми (backend/src/modules/programs/):** окремо від "Шаблонів тренувань"
вище — іменована програма (`programs`/`program_exercises`) створюється
ЗАЗДАЛЕГІДЬ, вручну (вправи + `targetSets`), і не потребує жодної попередньої
історії тренувань (на відміну від `programLabel`-шаблону, який можна
застосувати лише ПІСЛЯ того, як тренування з такою міткою вже було). Для
нового користувача без жодного тренування це єдиний спосіб стартувати з
готового набору вправ.
- CRUD: `GET/POST /api/programs`, `GET/PUT/DELETE /api/programs/:id`.
- Ротація A/Б (і далі по колу для 3+ програм): `programs.orderIndex`
  присвоюється автоматично в кінець черги при створенні. `GET
  /api/programs/suggestion` (`getSuggestedProgram` у `programs.service.ts`) —
  дивиться останнє фактично стартоване з `programId` тренування й повертає
  наступну по колу програму; якщо жодного ще не було або остання
  використана програма вже видалена — повертає першу (`orderIndex=0`). Це
  лише підказка, не обмеження: бекенд не валідує повторний вибір тієї самої
  програми поспіль.
  **UI-нюанс:** цей ендпоінт реалізований і протестований, але фронтенд його
  зараз НЕ використовує — `NewWorkoutButton` показує звичайний випадаючий
  список програм без виділення "наступної" (користувач свідомо попросив
  прибрати авто-пропозицію з кнопки; рішення 2026-09-20).
- Автозаповнення: `POST /api/workouts { programId }` копіює список вправ
  програми (`targetSets` штук підходів на вправу), а вагу й повторення
  підтягує з **останнього фактичного виконання** кожної вправи (в будь-якому
  тренуванні користувача) — `findLatestWorkoutExercise` у
  `workouts.service.ts`. Якщо в програмі підходів більше, ніж було минулого
  разу — останнє відоме значення повторень повторюється (стартова підказка,
  користувач однаково редагує вручну). `workouts.programId` фіксує зв'язок;
  назва програми так само стає `workouts.programLabel` цього тренування.
- Видалення програми — справжнє (`DELETE`), каскадить `program_exercises`;
  `workouts.programId` існуючих тренувань стає `null` (сам запис, вправи й
  підходи не чіпаються), вправи в загальному списку "Вправи" не зачіпаються
  (`onDelete: 'restrict'` на `program_exercises.exerciseId`).
- Сторінка `/programs` (`ProgramsPage.tsx`, пункт «Програми» в навбарі) —
  список програм (назва + вправи з `targetSets` у дужках) + форма
  створення/редагування: назва, вибір вправ, поле "цільова кількість
  підходів" на кожну, реордер вправ кнопками ▲▼.
- `WorkoutFormPage.tsx` — кнопка «Зберегти як програму»: створює нову
  Програму з поточного стану форми (вправи + кількість підходів кожної, як
  `targetSets`); попап із полем назви, підставляється поточна "Назва"
  тренування. Якщо `workout.program` існує — кольоровий бейдж із назвою
  програми біля дати (зникає сам, коли програму видалено, бо `program`
  приходить із бекенду через `workouts.programId`).
- `NewWorkoutButton` об'єднує два джерела шаблонів у одному меню: програми
  показуються першими (авторитетне джерело), історичні `programLabel`-шаблони
  — тільки для міток, які ще не мають збереженої програми (сумісність зі
  старими даними до появи програм).
- Той самий gotcha з транзакцією (`tx.query`, не `db`) стосується і
  `programs.service.ts` (`createProgram`/`updateProgram`).

**Windows-специфічні нюанси dev-середовища:**
- Vite hot-reload не бачив змін файлів через bind-mount без polling —
  у `frontend/vite.config.ts` увімкнено `server.watch.usePolling`.
- Той самий bind-mount-без-polling баг ловив і бекенд: `tsx watch` теж
  побудований на chokidar, і без `CHOKIDAR_USEPOLLING=true` жодного разу
  не перезапускався після правок файлів на Windows — контейнер тихо віддавав
  стару логіку без помилок (виявлено на пагінації `/api/workouts`: код на
  диску вже повертав `{data, total, ...}`, а живий бекенд — старий голий
  масив). Виправлено через `CHOKIDAR_USEPOLLING`/`CHOKIDAR_INTERVAL` у
  `environment` сервісу `backend` в `docker-compose.dev.yml`.
- Третій прояв того ж класу проблем: зміни `frontend/tailwind.config.js`
  (нові `theme.extend.keyframes`/`animation`/кольори тощо) Vite коректно
  бачить і робить full page reload у браузері, але Tailwind/PostCSS-кеш
  усередині вже запущеного dev-сервера на Windows bind-mount інколи не
  інвалідується — нові utility-класи (перевірено через `@keyframes`)
  фізично відсутні в CSS, хоч інші класи з того самого редагування файлу є.
  Ознака: новий клас (напр. `animate-*`) видимо не діє. Фікс — повний
  рестарт контейнера: `docker compose -f docker-compose.dev.yml restart frontend`
  (просто reload сторінки браузера не допомагає).
- Те саме з бекендом: `backend_node_modules` — named volume, і ні зміна
  `package.json`, ні `--build` його не оновлюють. Після нової backend-залежності
  dev-бекенд тихо падає на hot-reload з `ERR_MODULE_NOT_FOUND` — треба
  `docker compose -f docker-compose.dev.yml exec backend npm install` + `restart backend`.
  А нові змінні з `.env` (`env_file`) підхоплюються лише при перестворенні
  контейнера: `up -d --force-recreate backend`, не `restart`.
- `npm install` виконується у named volume контейнера (`frontend_node_modules`),
  не на хості — після додавання нових залежностей треба також запустити
  `npm install` у `frontend/` **на хості**, інакше редактор (TS-сервер) не
  бачить нових типів і показує хибні помилки (`JSX.IntrinsicElements` тощо).
- Порт хоста для postgres у dev може конфліктувати з іншими проєктами
  користувача — керується через `POSTGRES_PORT` у `.env` (зараз 5433,
  бо 5432 зайнятий іншим контейнером на машині користувача).

## Дизайн та іконка застосунку

Макети живуть у дизайн-канвасі користувача «MyGym App Icon»:
https://claude.ai/artifact/8JHoTP8Ny7DEfEKNrnjnvZ (артборди іконки, хедера,
сторінок для телефону). Редизайни сторінок робляться саме за ним.

**Логотип — «Сходинка»** (артборд `project/LogoFinal.dc.html` «Логотип ·
фінал «Сходинка»», вибір користувача 2026-10-16; замінив попередній варіант
«B · Помаранчевий фон»). Помаранчевий `#ff5a36` квадрат (viewBox 256, радіус
56), «My» білим угорі праворуч, «Gym» темним `#16181d` унизу ліворуч —
сходинкою, шрифт Barlow Condensed 800 (уже в контурах).
- `frontend/public/favicon.svg` — повна «Сходинка»: фавікон і **джерело** PNG-іконок
  PWA. `npm run icons` (`frontend/scripts/generate-icons.mjs`, `sharp`) генерує
  `public/icons/`: `icon-192/512` (як є, прозорі кути), `icon-{192,512}-maskable-vN`
  (фон на всю площу; напис відцентрований за власними межами і максимально
  великий за двох умов: межі в центральному квадраті 80% і жоден піксель не
  виходить за повне коло r=50% — рахується по пікселях) і `apple-touch-icon`
  (180, непрозора — iOS сам заокруглює). PNG комітяться, Docker їх не
  перегенеровує — після зміни лого запустити `npm run icons`.
  **Чому не коло r=40% зі специфікації maskable:** так напис виходив помітно
  дрібнішим, ніж на ярлику «Додати на головний екран» (скарга користувача
  2026-10-21) — свідомий компроміс. **Зміна іконки → підняти `-vN`** в імені
  (скрипт + маніфест): встановлений WebAPK перекачує іконки лише при зміні.
- **PWA (встановлюваний застосунок):** `public/manifest.webmanifest`
  (`display: standalone`, `id: "/"`, кольори = `surface` `#14171c`, як і
  `<meta name="theme-color">` — статус-бар зливається з хедером). Сервіс-воркера
  свідомо нема (Chrome для встановлення не вимагає; офлайн — окрема задача через
  `vite-plugin-pwa`). `viewport-fit=cover` → safe-area відступи: зверху на
  `<header>` у `Navbar`, а на login/register/екрані завантаження (там Navbar
  нема) — на самій сторінці; низ і боки — на `<main>` через `max(…, env(…))`.
  Встановлення як WebAPK працює лише з HTTPS-домену. `nginx.frontend.conf`:
  маніфест з `application/manifest+json` + `no-cache`; `/icons/` без SPA-fallback
  (неіснуюча іконка = 404, а не index.html).
- `frontend/public/logo.svg` — горизонтальний локап (іконка + напис «MyGym»
  контурами Barlow Condensed, viewBox 710×256) у хедері (`Navbar.tsx`,
  `<img src="/logo.svg" class="h-9 w-auto">`). Взятий з горизонтального
  локапу артборда (світлий фон), але «My» перефарбоване в білий — як на
  темному артборді, бо хедер темний. Спрощений знак
  «M + G» з артборда (для ≤64 px) **свідомо не використовується** — користувач
  не хоче іконку зі скороченням (2026-10-16), навіть на дрібних розмірах.
- **Gotcha:** текст у SVG — контури (`<path>`), а не `<text>`: SVG як
  `<img>`/фавікон не вантажить вебшрифти. Контури взяті **як є** з артборда
  (перший `<svg viewBox="0 0 256 256">` у `LogoFinal.dc.html` — повний знак) — при зміні макета перекопіювати path-и звідти, а не
  правити руками.

## Стиль спілкування з користувачем

Користувач — програміст, спілкується українською, любить розуміти "чому"
за кожним технічним рішенням (просив пояснення різниці JWT vs сесії,
Drizzle vs Prisma тощо) перед тим як погодитись. При зміні стеку чи підходу
— пояснювати компроміси, а не просто міняти мовчки.
