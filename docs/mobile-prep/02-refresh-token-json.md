# Завдання 2: Refresh-токен у JSON як другий режим (для мобільного клієнта)

## Мета
Дозволити клієнту, який не використовує cookie (майбутній React Native застосунок),
отримувати й передавати refresh-токен у тілі запиту/відповіді. Веб-режим через
httpOnly cookie лишається **без змін**.

## Навіщо
На RN немає надійного cookie jar, захищеного Keystore. Мобільний клієнт
зберігатиме refresh у `expo-secure-store` (Android Keystore) і слатиме його в JSON.
httpOnly захищає від XSS у браузері; нативний застосунок чужий JS не виконує,
тому це не послаблення безпеки.

## Контекст у репо
- `backend/src/modules/auth/auth.routes.ts` — `/register`, `/login` ставлять cookie
  `mygym_refresh`; `/refresh` і `/logout` читають **лише** `request.cookies.mygym_refresh`;
  `/refresh` повертає тільки `{ accessToken }`.
- `backend/src/modules/auth/auth.service.ts` — ротація, SHA-256-хеші в БД,
  `ROTATION_GRACE_MS` = 60 с, logout **видаляє** рядок (див. CLAUDE.md «Auth: життя токенів»).
- `backend/src/modules/auth/auth.schema.ts` — Zod-схеми.
- `backend/test/auth.test.ts` — існуючі тести auth.
- Вхід через Google (`google.client.ts`, `GET /api/auth/google` → callback) — серверний
  OAuth-flow, результат — завжди редирект + `mygym_refresh` cookie (CLAUDE.md «Вхід через Google»).
  Акаунт, створений через Google, пароля не має — для нього `/login` з паролем не працює.
- `authenticate.ts` уже приймає сесійний JWT, PAT `mygym_pat_…` і OAuth-токени
  `mygym_oat_…` (див. CLAUDE.md). Mobile-режим — це лише інший транспорт для
  сесійного refresh-токена; access-токен той самий JWT, `authenticate.ts` не змінюється.

## Що зробити
1. Режим клієнта визначати явно заголовком `X-Client: mobile` (а не самою наявністю
   поля в тілі) — пояснити компроміс. Для mobile-режиму:
   - `/register`, `/login` → відповідь `{ accessToken, refreshToken, user... }`, cookie **не** ставиться;
   - `/refresh` приймає `{ refreshToken }` у тілі → `{ accessToken, refreshToken }`;
   - `/logout` приймає `{ refreshToken }` у тілі.
2. Веб-режим (без заголовка) — поведінка байт-у-байт як зараз; refresh-токен у JSON вебу
   **ніколи** не віддається.
3. Zod-схеми для нових тіл; помилки — існуючі стабільні коди (`error`), без нових прозових повідомлень.
   Якщо потрібен новий код — додати переклад у `errors.*` в `en/uk.json`.
4. Ротація, grace-вікно, видалення при logout — спільна логіка сервісу, без дублювання.
5. Тести в `auth.test.ts`:
   - mobile login → токен у тілі, немає `set-cookie`;
   - mobile refresh ротує токен; старий у межах grace ще приймається; після grace — 401;
   - mobile logout видаляє рядок; повторний refresh тим токеном → 401;
   - веб-сценарії не змінились (існуючі тести зелені);
   - веб-запит без заголовка не отримує refreshToken у JSON.
6. Rate limit на `/login`/`/register` — однаковий для обох режимів.
7. **Google-вхід для мобільного — спершу план, без коду.** Поточний flow закінчується
   редиректом і cookie, що RN-застосунку не підходить. Порівняти варіанти й дочекатися
   мого рішення:
   - нативний Google Sign-In на телефоні → ID-токен → новий `POST /api/auth/google/mobile`
     `{ idToken }` (бекенд перевіряє `verifyIdToken` з Android client ID в `aud`) →
     `{ accessToken, refreshToken }`; логіка `loginWithGoogle` спільна з вебом;
   - або той самий серверний flow у системному браузері з поверненням через deep link
     (одноразовий код замість cookie).
   Що з цього потребує змін у Google Cloud Console (Android OAuth client, SHA-1) —
   перелічити як інструкцію для мене.

## Обмеження
- Не міняти TTL, формат токена, схему БД.
- Фронтенд не чіпати.
- PAT/OAuth для MCP (`/api/tokens`, `/api/oauth/*`) не чіпати — це інший механізм.

## Критерії готовності
- `npm test` + typecheck у `backend/` зелені.
- CLAUDE.md, розділ «Auth: життя токенів»: описано mobile-режим і чому він безпечний.
