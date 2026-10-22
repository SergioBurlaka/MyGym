# Завдання 3: `GET /api/auth/me`, видалення акаунта і сторінка «Профіль»

## Мета
Додати ендпоінт поточного користувача, видалення акаунта з підтвердженням
і сторінку «Профіль» у вебі, звідки акаунт можна видалити.

## Навіщо
Google Play вимагає для застосунків з акаунтами видалення акаунта **і** в застосунку,
**і** через веб. Сторінки профілю зараз немає; `DELETE users` у коді відсутній —
`/privacy` поки обіцяє видалення лише за запитом на email.

## Контекст у репо
- `backend/src/db/schema.ts`, `docs/db/ARCHITECTURE.md` — FK. Усі таблиці з `userId`
  каскадно видаляються з `users`, **але** `program_exercises.exercise_id` і
  `workout_exercises.exercise_id` мають `onDelete: 'restrict'` на `exercises`.
  **Уже відомо (CLAUDE.md, gotcha в розділі «MCP-сервер»): `DELETE FROM users` для
  користувача з тренуваннями падає** — каскад іде в `exercises` і впирається в `restrict`.
  Тести цього не ловили, бо чистять БД через `TRUNCATE … CASCADE`.
- Таблиці, що мають зникнути разом з акаунтом: `refresh_tokens`, `api_tokens` (PAT і
  OAuth access-токени), `oauth_authorization_requests`, `oauth_grants`,
  `oauth_refresh_tokens`, `exercises`, `workouts` (+ `workout_exercises`, `sets`),
  `programs` (+ `program_exercises`), `training_schedule_history`.
- Акаунт може бути без пароля: `users.passwordHash` nullable (створений через Google,
  `googleSub`). Акаунт з паролем може мати й прив'язаний Google.
- `backend/src/modules/auth/` — роути/сервіс/схеми, argon2, `requireSession`
  (сесія, не PAT/OAuth — як у `/api/tokens` і API згоди OAuth).
- `frontend/src/context/AuthContext.tsx`, `frontend/src/components/Navbar.tsx`
  (меню профілю вже є — там пункт «Інтеграції»), `frontend/src/App.tsx` (роути).
- Конвенція API на фронтенді: `frontend/src/shared/api/<ресурс>/` (`*.api.ts`, `*.keys.ts`, `hooks/`).

## Що зробити
### Бекенд
1. `GET /api/auth/me` (Bearer) → `{ id, email, createdAt, hasPassword, hasGoogle }`
   (без хешів/токенів, `googleSub` не віддавати).
2. `DELETE /api/auth/account` — **лише сесія** (`requireSession`): PAT чи OAuth-токен
   програми не повинен могти видалити акаунт.
   - Підтвердження: акаунт з паролем → тіло `{ password }`, невірний → стабільний код
     (напр. `invalid_password`). Акаунт без пароля → запропонувати спосіб і пояснити
     компроміс (напр. ввести свій email дослівно, або свіжий вхід через Google не
     старший за N хвилин) — дочекатися мого рішення.
   - Видалення в одній транзакції: спершу явно залежні від `exercises` рядки
     (`workouts` → каскад `workout_exercises`/`sets`, `programs` → каскад
     `program_exercises`), потім `users` (решта каскадом). Пояснити порядок у коді.
   - Очистити refresh-cookie у відповіді (веб).
   - Rate limit як на логін (захист від перебору пароля).
3. Тести (`backend/test/`): користувач з вправами, програмами, тренуваннями, підходами,
   історією розкладу, PAT, OAuth-grant з токенами → видалення → 0 рядків у всіх
   таблицях для цього userId; дані **іншого** користувача не зачеплені; невірний пароль
   не видаляє нічого; акаунт без пароля видаляється обраним способом; PAT → 403;
   старий access-токен після видалення → 401 на захищених ендпоінтах (перевірити,
   чи так зараз — якщо ні, виправити).

### Фронтенд
4. `shared/api/auth/` (або `account/`): `getMe`, `deleteAccount` + хуки за конвенцією.
5. Сторінка `/profile` (`ProfilePage.tsx`), пункт у меню профілю й мобільному меню:
   email, дата реєстрації, спосіб входу (пароль / Google), вихід, «Видалити акаунт» —
   модалка з поясненням, що видаляються всі дані безповоротно (і що підключені
   застосунки Claude/ChatGPT втратять доступ), з полем пароля або іншим підтвердженням
   для Google-акаунта. Після успіху — logout і редірект на `/login` з повідомленням.
6. Усі тексти — en/uk, коди помилок через `translateApiError`.

## Обмеження
- Без м'якого видалення (soft delete) — дані мають реально зникати.
- Бекапи в `backups/` не чіпати (про них — у privacy policy, завдання 4).

## Критерії готовності
- `npm test`/typecheck бекенду, `npm run build` фронтенду — зелені.
- CLAUDE.md: нові ендпоінти, як вирішено проблему каскаду (і прибрати gotcha
  «Виправити перед фічею «видалити акаунт»»), сторінка профілю.
