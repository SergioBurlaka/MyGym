---
paths:
  - "backend/src/modules/auth/**"
  - "backend/src/plugins/authenticate.ts"
  - "backend/src/utils/password.ts"
  - "backend/src/utils/safeNext.ts"
  - "backend/test/auth.test.ts"
  - "backend/test/google-auth.test.ts"
  - "frontend/src/api/**"
  - "frontend/src/context/AuthContext.tsx"
  - "frontend/src/shared/api/auth/**"
  - "frontend/src/components/GoogleSignInButton.tsx"
  - "frontend/src/pages/LoginPage.tsx"
  - "frontend/src/pages/RegisterPage.tsx"
  - "frontend/src/pages/PrivacyPage.tsx"
  - "frontend/src/utils/safeNext.ts"
---

# Auth: сесії, токени, вхід через Google

## Auth: життя токенів

Access-токен живе 15 хв (`JWT_ACCESS_TTL`), refresh — 30 днів (httpOnly cookie
`mygym_refresh`, `path=/api/auth`). Сесія мусить пережити тренування: інакше
посеред нього через ~15 хв — банер «Не вдалося зберегти».

- **Фронтенд (`frontend/src/api/client.ts`)** тримає токен живим, поки вкладка
  відкрита: таймер оновлює його за 60 с до `exp`, а оскільки мобільні браузери
  заморожують таймери у фоні — ще й на `visibilitychange`/`focus`/`online`,
  якщо токен уже протух чи от-от протухне. Усі refresh (старт застосунку в
  `AuthContext`, таймер, повтор після 401) йдуть через ОДИН single-flight
  `refreshAccessToken()` — ротований refresh-токен ніколи не шлеться двічі
  паралельно (інакше StrictMode в dev слав би два refresh на старті).
  Мережева помилка refresh токен НЕ скидає; лише справжній 401 від
  `/auth/refresh` → `setOnSessionLost` → `AuthContext` робить `setUser(null)`.
- **Таймаут запитів** — `REQUEST_TIMEOUT_MS` = 20 с (`api/client.ts`) на інстансі `api` і на
  самому refresh-запиті: у залі запит може висіти без відповіді, і сторінка вічно показувала б
  «Завантаження…», а завислий single-flight refresh тримав би всі запити, що на нього чекають.
  Таймаут — мережева помилка, сесію не скидає; `translateApiError` (`utils/apiError.ts`)
  перекладає `ECONNABORTED`/`ETIMEDOUT` як `errors.timeout`. Свій таймаут — у
  `PUT …/exercises` (`.claude/rules/workouts.md`) і CSV-імпорту (`.claude/rules/csv-import.md`).
- **Gotcha: `Secure`-cookie по HTTP.** `secure: request.protocol === 'https'`
  (Fastify `trustProxy` + `X-Forwarded-Proto` від nginx), а не за `NODE_ENV`:
  браузер мовчки відкидає `Secure`-cookie, отриману по HTTP, і refresh по HTTP
  не працював би взагалі. На проді (HTTPS) `Secure` є; у dev (HTTP) його нема.
- Cookie має `maxAge` (= `JWT_REFRESH_TTL`), а не сесійна — мобільний браузер
  губив сесійну cookie, коли вбивав фонову вкладку.
- **Grace-вікно ротації 60 с** (`ROTATION_GRACE_MS` у `auth.service.ts`): щойно
  відкликаний токен ще хвилину приймається повторно — на випадок, коли сервер
  ротував, а відповідь із новою cookie загубилась у поганій мережі в залі.
  Свідомий компроміс безпеки для особистого застосунку. Саме через це logout
  **видаляє** рядок `refresh_tokens`, а не ставить `revokedAt` — інакше grace
  дав би хвилину на повторне використання токена після виходу.
- **Прибирання:** ротований рядок лишається (для grace), тож інакше кожен refresh
  (раз на ~15 хв на відкриту вкладку) лишав би рядок назавжди. `issueTokenPair`
  (вхід, реєстрація, Google, ротація) видаляє рядки **цього користувача**, що вже
  не можуть бути прийняті: прострочені або відкликані понад `ROTATION_GRACE_MS`
  тому. Рядки неактивних користувачів лежать до їхнього наступного входу.

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
  робочим** (рішення користувача; свідомо прийнятий ризик: email при
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
- `google-auth-library` зафіксовано на 10.x (11.x вимагає Node ≥22); на Node 24
  можна оновити окремою задачею.
- Тести (`test/google-auth.test.ts`) мокають `google.client.ts` цілком — без мережі.
- `/privacy` (`PrivacyPage.tsx`, публічна) — на неї посилається consent screen Google.
