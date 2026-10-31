---
paths:
  - "backend/src/modules/oauth/**"
  - "backend/src/modules/apiTokens/**"
  - "backend/src/utils/tokens.ts"
  - "backend/src/plugins/authenticate.ts"
  - "backend/test/oauth*.test.ts"
  - "backend/test/api-tokens.test.ts"
  - "backend/test/client-icon.test.ts"
  - "frontend/src/pages/IntegrationsPage.tsx"
  - "frontend/src/pages/OAuthConsentPage.tsx"
  - "frontend/src/shared/api/oauth/**"
  - "frontend/src/shared/api/tokens/**"
---

# Персональні токени доступу та OAuth для MCP-клієнтів

**Таблиці.** `api_tokens` — PAT (`name`, sha256 `tokenHash` unique, `lastUsedAt`, `revokedAt`;
відкликання м'яке — рядок лишається); тут же OAuth access-токени (`grantId` не null, `expiresAt`
= +1 год). `oauth_authorization_requests` — запит на згоду (10 хв, прив'язаний до браузера
`browserHash`, потім одноразовий код); `oauth_grants` — підключення (рядок у «Підключених
застосунках»); `oauth_refresh_tokens` — його ротовані refresh-токени. `client_logo_uri` (nullable,
лише https) — `logo_uri` з CIMD-документа, копіюється запит → grant так само, як `clientName`.
`oauth_clients` — клієнти DCR (`id` = `mygym_cli_…`, хеш секрету, метод автентифікації,
`redirect_uris` jsonb); не FK до grant-ів.

## Персональні токени доступу (`modules/apiTokens/`, MCP, частина 1)

Довгоживучий токен `mygym_pat_<64 hex>` для програм, що діють від імені
користувача (MCP-сервер, Claude Code) — без браузерного refresh-flow.
- `authenticate.ts`: `Bearer mygym_pat_…` → пошук активного токена за sha256
  (`findUserByApiToken`), інакше JWT. `request.authMethod` =
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
  mygym <origin>/mcp --header …` (див. "MCP-сервер" у `.claude/rules/mcp-server.md`).
  Сторінка (макет «MyGym — Інтеграції»): картка з
  адресою `<origin>/mcp` → вкладки інструкцій Claude / ChatGPT / Claude Code
  (кількість кроків і порад — константа `GUIDES`, тексти — `integrations.guide.*`
  у словниках, розмітка через `<Trans>`) → «Підключені застосунки» → «Токени
  доступу». **Gotcha:** `<Trans>` розбирає `<ТОКЕН>` у тексті як тег і мовчки
  його з'їдає — плейсхолдер і адреса сервера передаються окремими компонентами
  (`<token/>`, `<url/>`), не текстом словника.
- Ліміт 20 рахується в транзакції з `SELECT … FOR UPDATE` рядка `users` —
  інакше паралельні POST-и проходили б перевірку разом.
- Тести: `test/api-tokens.test.ts` (зокрема ізоляція двох користувачів через PAT).

## OAuth для MCP-клієнтів (`modules/oauth/`, MCP, частина 3)

MyGym — власний OAuth authorization server для MCP (специфікація MCP
2026-07-28), щоб Claude і ChatGPT підключались через «Sign in» без копіювання
токена. Рішення користувача: MCP і REST API — **один ресурс**
(OAuth-токен для `<PUBLIC_URL>/mcp` приймає й API); клієнти — через CIMD
з allow-list хостів (Claude, ChatGPT) **або DCR** (для Gemini й
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
  бекенд; решта `/.well-known` (ACME) — webroot nginx.
- **CIMD** (`cimd.client.ts`): `client_id` = https-URL без порту на хості з
  `OAUTH_CLIENT_HOSTS` (default `claude.ai,claude.com,chatgpt.com`); документ
  тягнеться без редиректів, 5 с, ≤5 КБ, кеш за Cache-Control (помилки не
  кешуються); `redirect_uris` лише https або loopback http. Redirect — точний
  збіг, для loopback (Claude Code) порт ігнорується (RFC 8252). Claude:
  `https://claude.ai/oauth/mcp-oauth-client-metadata`, ChatGPT:
  `https://chatgpt.com/oauth/client.json`. Тести мокають лише `resolveClient`.
- **DCR** (RFC 7591, `dcr.service.ts`, `POST /api/oauth/register`, у discovery
  `registration_endpoint`): реєстрація **відкрита** (рішення
  користувача) — `redirect_uris` будь-які https або loopback http (як у CIMD,
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
  redirect і має відкритий редирект з нашого домену без входу.
  **Gotcha:** код, що розбирає `clientId` як URL (`new URL(grant.clientId)`),
  на DCR-клієнті кидає виняток (напр., «Інтеграції» рендеряться порожніми після
  підключення Gemini). Перевіряти `startsWith('https://')`.
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
  згоду жертві.
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
