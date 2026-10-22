# Завдання 7: Платформонезалежний API-клієнт (`TokenStore` + адаптери платформи)

## Мета
Розділити `frontend/src/api/client.ts` на спільне ядро (single-flight refresh, таймер за 60 с
до `exp`, повтор після 401, `setOnSessionLost`) і веб-специфічні адаптери, щоб у RN
підставити власні (SecureStore, `AppState`, NetInfo). Плюс прибрати Vite/DOM-залежності
з коду, який має стати спільним.

## Навіщо
Ядро логіки токенів вже правильне і вистраждане (див. CLAUDE.md «Auth: життя токенів»);
його не треба переписувати для мобільного — лише інжектити інші залежності.

## Контекст
- `frontend/src/api/client.ts` — зараз використовує `import.meta.env.VITE_API_URL ?? '/api'`,
  `withCredentials: true`, `atob()`, слухачі `visibilitychange`/`focus`/`online` на `document`/`window`.
- `frontend/src/context/AuthContext.tsx`, `frontend/src/i18n/index.ts` (browser languagedetector, `localStorage`).
- `frontend/src/shared/api/**`, `frontend/src/types`, `frontend/src/utils` — кандидати в спільні пакети.
- Бажано після завдання 2 (mobile-режим refresh на бекенді).

## Що зробити
1. Інтерфейси (напр. `frontend/src/api/platform.ts`):
   - `TokenStore` — `getAccessToken/setAccessToken`, `getRefreshToken?/setRefreshToken?`
     (у вебі refresh живе в cookie → методи відсутні/no-op; у RN — SecureStore);
   - `AppLifecycle` — `onForeground(cb)`, `onOnline(cb)` → функції відписки;
   - `config` — `baseURL`, `withCredentials`.
2. Ядро: `createApiClient({ tokenStore, lifecycle, config, onSessionLost })` без прямих
   звернень до `window`, `document`, `import.meta`. Декодування `exp` з JWT — без `atob`
   (невелика base64url-функція або обґрунтована залежність).
3. Веб-адаптери: in-memory access-токен + cookie, `visibilitychange`/`focus`/`online`,
   `VITE_API_URL` читається **лише** тут.
4. Пройтися по `shared/api`, `types`, `utils`: знайти й винести назовні будь-які
   звернення до `import.meta.env`, `window`, `localStorage`, `document`; `utils/weight.ts`
   використовує `i18n.language` — залишити, але не імпортувати браузерний детектор із спільного коду.
5. `i18n/index.ts`: відокремити ініціалізацію ресурсів (спільна) від детектора мови (веб).
6. Поведінка вебу не змінюється.

## Обмеження
- Не створювати поки монорепо/пакети — лише чисті межі всередині `frontend/src`
  (перенесення в `packages/*` — окремим кроком разом зі стартом мобільного застосунку).
- Не змінювати конвенцію `shared/api/<ресурс>/`.

## Перевірка
- `npm run build` без помилок; `grep` по `shared/`, `types/`, `utils/`, ядру клієнта — без
  `window`, `document`, `localStorage`, `import.meta`.
- Ручний чек-лист: логін; простій >15 хв у фоні і повернення — запит проходить без
  банера; два вкладки одночасно; офлайн → онлайн; logout.
- CLAUDE.md: оновити розділ «Auth: життя токенів» (де ядро, де адаптери).
