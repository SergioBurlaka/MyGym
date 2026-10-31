---
paths:
  - "mcp-server/**"
---

# MCP-сервер

## MCP-сервер (`mcp-server/`, MCP, частина 2)

Окремий пакет (Node 24 + TS, `@modelcontextprotocol/sdk` 1.32, **Fastify** —
як бекенд, а не Express із прикладів SDK), через який Claude керує MyGym.
**Тонкий stateless-проксі без бізнес-логіки й без токенів:**
- `POST /mcp` — на **кожен** запит новий `McpServer` + `StreamableHTTPServerTransport`
  (`sessionIdGenerator: undefined`, `enableJsonResponse: true`) + `apiClient` з
  `Authorization` саме цього запиту → пересилається в бекенд без перевірки
  (вирішує бекенд — PAT вище). Ніколи не тримати сервер/клієнт між запитами:
  інструменти «запам'ятали б» токен першого користувача (тест ізоляції це ловить).
  Без `Bearer` → 401; `GET/DELETE /mcp` → 405;
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
  стоїть автозбереження форми). Рішення користувача: бекенд не чіпати,
  а в описі інструмента прямо написати «REPLACES ALL… спершу get_workout». Додати
  merge-ендпоінт у бекенд — якщо колись Claude таки зітре вправи.
  `sets: []` дозволено — так `get_workout` віддає вправи щойно після
  `start_workout`; описи `start_workout`/`log_workout_exercises`/`get_workout` пояснюють, що
  записаний підхід = виконаний, а минулі повтори й ціль +1 — у `previous`/`target`, і семантику
  ваги за `equipment` (диски на сторону, одна гантель, гантелей у повторенні, повтори на сторону
  для `unilateral`). `barKg` — теж через `z.coerce`.
- `create_program`: у вправи — `targetSets`, `tryMoreAfterWorkouts` (без нього — стандарт
  4/6/5) і `lockSets`; програмного порогу нема.
- Видалення через MCP свідомо нема — деструктивне лишається в UI.
- Ліміт 60 запитів/хв на токен (ключ — sha256 заголовка). **Gotcha:** роути мусять
  бути всередині `app.register(...)` — оголошені на корені додаються до того, як
  `@fastify/rate-limit` завантажився, і `config.rateLimit` тихо не діє.
- Запит до бекенду з таймаутом 15 с; помилка після `reply.hijack()` закриває
  відповідь сама (500 JSON-RPC) — Fastify після hijack цього вже не робить.
- Docker: сервіс `mcp` у `docker-compose.yml` (образ працює від `USER node`) (nginx `/mcp` → `mcp:8080` через
  `resolver`); у dev — `mcp` на `:8080` з hot-reload, і Vite
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
  типова причина — dev-токен у прод-конекторі.
- **401 з `WWW-Authenticate`:** без `Bearer` або з токеном, який API відхиляє
  (перевірка `GET /api/settings` на **кожен** запит — без кешу: кешоване
  «прийнято» після протухання OAuth-токена давало б `isError` у 200 замість 401,
  і клієнт не робив би refresh), MCP-сервер відповідає справжнім HTTP 401 з `Bearer
  resource_metadata="<PUBLIC_URL>/.well-known/oauth-protected-resource/mcp"`.
  Саме на 401 (а не на `isError` у 200) Claude/ChatGPT вмикають «Sign in» і
  оновлюють протухлий OAuth-токен. API недоступне → запит пропускається
  (інструменти скажуть «could not reach»), щоб не просити зайвий раз увійти.
  Конфіг — `PUBLIC_URL` (compose: `https://${DOMAIN}`, dev: `http://localhost:5173`).
- **Gotcha (поза MCP, міграція 0019):** з `restrict` користувача з тренуваннями не
  можна видалити — каскад `users → exercises` падає на `workout_exercises.exerciseId`
  раніше, ніж каскад `users → workouts` прибирає посилання. `NO ACTION` **не
  допомагає** (перевірено) — потрібен `DEFERRABLE INITIALLY DEFERRED` (перевірка на
  коміті; `RESTRICT` не відкладається). Так на обох FK до вправ (`workout_exercises`,
  `program_exercises`): видалення користувача проходить, пряме видалення вправи з
  історією — `23503`. Drizzle `DEFERRABLE` не описує — дописано в міграцію
  руками; якщо drizzle-kit колись перегенерує ці FK, повернути. Тест —
  `test/db-constraints.test.ts` (звичайні тести цього не ловлять, бо `TRUNCATE … CASCADE`).
