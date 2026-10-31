---
paths:
  - "docker-compose.dev.yml"
  - "backend/Dockerfile.dev"
  - "frontend/Dockerfile.dev"
  - "mcp-server/Dockerfile.dev"
  - "frontend/vite.config.ts"
  - "frontend/tailwind.config.js"
  - "backend/package.json"
  - "frontend/package.json"
  - "mcp-server/package.json"
  - ".env.example"
---

# Dev-середовище на Windows

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
