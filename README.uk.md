# MyGym

[English](README.md) · **Українська**

Особистий щоденник тренувань (гантелі, штанга, лавка, стійки): записуєте підходи,
дивитесь графіки прогресу по кожній вправі і отримуєте нагадування, коли пора
додати вагу чи повторення.

## Стек

- **Backend:** Node.js + TypeScript, [Fastify](https://fastify.dev) + [Zod](https://zod.dev) (валідація), [Drizzle ORM](https://orm.drizzle.team) + drizzle-kit (міграції), PostgreSQL
- **Auth:** email + пароль (argon2), JWT access + refresh (refresh — httpOnly cookie, зберігається в БД для можливості відкликання)
- **Frontend:** React + TypeScript + Vite, Tailwind CSS, Recharts
- **Інфраструктура:** Docker (окремі контейнери: postgres, backend, frontend, nginx), docker-compose для dev (hot-reload) і prod, nginx як reverse-proxy з HTTPS (Let's Encrypt)

## Логіка прогресії

Кожна вправа належить до однієї з категорій:

| Категорія | Приклади | Повторення | Крок ваги |
|---|---|---|---|
| Велика група | присідання, станова, жим лежачи, тяга в нахилі, випади | 6-15 | +1.25 кг з кожного боку |
| Мала група | біцепс, французький жим, розведення, жим стоячи | 6-20 | +0.5 кг з кожного боку |
| Без ваги | віджимання, підняття ніг/корпусу | 6-30 | підказка почати додавати вагу |

Правила нагадування:
- Якщо на всіх підходах досягнуто верхньої межі діапазону повторень — підказка додати вагу.
- Якщо 14+ днів без прогресу (без зростання ваги чи максимальних повторень) — м'яке нагадування спробувати більше.
- Ручне додавання повторень/ваги завжди дозволене поза розкладом.

## Швидкий старт (dev, з hot-reload)

```bash
cp .env.example .env
# відредагуйте .env за потреби (для dev значення за замовчуванням підходять)

docker compose -f docker-compose.dev.yml up --build
```

- Frontend (Vite, hot-reload): http://localhost:5173
- Backend API: http://localhost:4000
- PostgreSQL: localhost:5432 (для підключення DBeaver/psql тощо)

Backend-контейнер сам застосовує міграції при старті (`npm run db:migrate`).

## Продакшн (на вашому сервері)

```bash
cp .env.example .env
# ОБОВ'ЯЗКОВО згенеруйте реальні секрети:
openssl rand -base64 48   # -> JWT_ACCESS_SECRET
openssl rand -base64 48   # -> JWT_REFRESH_SECRET
# надійний POSTGRES_PASSWORD, а також DOMAIN і CERTBOT_EMAIL

docker compose build
sh scripts/init-letsencrypt.sh   # лише перший раз: отримує HTTPS-сертифікат
docker compose up -d
```

Потрібен домен, що вказує на IP сервера (наприклад безкоштовний піддомен
DuckDNS), і відкриті порти 80 та 443. Застосунок буде доступний на
`https://<DOMAIN>`, HTTP автоматично перенаправляється на HTTPS. nginx проксує
`/api/*` на backend, `/mcp` на MCP-сервер, а все інше — на статичний білд
фронтенду.

Сертифікат поновлює контейнер `certbot` (перевіряє двічі на добу), nginx
перечитує конфіг раз на 6 годин. Конфіг nginx — шаблон
`nginx/templates/default.conf.template`, домен підставляється зі змінної `DOMAIN`.

### Перехід уже працюючого HTTP-сервера на HTTPS

Мердж у `main` одразу деплоїть, а nginx без сертифіката не стартує. Тому
порядок такий:

1. Піддомен DuckDNS вказує на IP сервера, порти 80 і 443 відкриті.
2. У `.env` на сервері дописати `DOMAIN` і `CERTBOT_EMAIL` (`NGINX_PORT` більше
   не потрібен). Без `DOMAIN` деплой впаде з помилкою compose ще до зупинки
   старого nginx.
3. Змерджити PR і дочекатися деплою: nginx перезапускається в циклі, поки
   немає сертифіката.
4. Одразу на сервері: `sh scripts/init-letsencrypt.sh` (за бажання спершу
   `STAGING=1 sh scripts/init-letsencrypt.sh` — повторний звичайний запуск
   сам замінить тестовий сертифікат на справжній).

Origin змінюється з `http://<IP>` на `https://<DOMAIN>`, тож усім доведеться
залогінитись заново.

### Оновлення на сервері

```bash
git pull
docker compose up --build -d
```

Нові Drizzle-міграції застосовуються автоматично при старті backend-контейнера.

## Тести

Інтеграційні тести (Vitest + `fastify.inject()`) працюють проти справжнього
PostgreSQL і самі застосовують міграції. Між тестами всі таблиці очищаються,
тому назва БД **обов'язково** має містити `test`, інакше запуск зупиниться.

```bash
# одноразово: окрема тестова БД у dev-контейнері postgres
docker compose -f docker-compose.dev.yml exec postgres createdb -U <POSTGRES_USER> mygym_test

cd backend
TEST_DATABASE_URL=postgres://<user>:<password>@localhost:<POSTGRES_PORT>/mygym_test npm test
```

У CI (`.github/workflows/deploy.yml`) тести бекенду й збірка фронтенду йдуть
перед деплоєм: деплой стартує лише, коли обидві перевірки зелені.

## Імпорт історії з Google Таблиць

На сторінці **Імпорт** можна завантажити CSV-експорт вашої таблиці тренувань
(Файл → Завантажити → Значення, розділені комами (.csv)). Парсер розрахований
саме на структуру оригінальної таблиці:

- дата вказана тільки в рядку першого підходу; наступні підходи того ж дня йдуть без дати
- кожна вправа має пару колонок «повторення» + «вага» (крім вправ без ваги)
- вага у форматі `2*20` = по 20 кг на кожну сторону/гантель

Тренування, для яких дата вже існує в базі, пропускаються (повторний імпорт
того самого файлу безпечний).

## Структура репозиторію

```
backend/    Fastify API, Drizzle-схема, міграції, логіка прогресії й CSV-імпорту
frontend/   React SPA (журнал, форма тренування, графіки, керування вправами)
mcp-server/ MCP-сервер для Claude (stateless-проксі до API)
nginx/      Конфіг reverse-proxy для продакшна (HTTPS-шаблон)
scripts/    init-letsencrypt.sh — перше отримання сертифіката
docker-compose.yml       Продакшн-стек
docker-compose.dev.yml   Dev-стек з hot-reload
.env.example             Шаблон змінних середовища
```

## Робота з Claude Code (оркестратор)

У `.claude/` налаштований легкий AI-оркестратор під соло-розробку: Claude
приймає задачу, описану словами, і веде її повним циклом
**гілка → план → реалізація → рев'ю → тести**, делегуючи перевірки субагентам.

### Швидкий старт

```bash
cd mygym
claude
```

Далі в сесії:

```
/feature додай поле "нотатки" до тренування
```

Claude підхоплює `CLAUDE.md` і `.claude/` автоматично, якщо запускати `claude`
з кореня репозиторію.

### Що відбувається після `/feature`

1. **Гілка.** Створює `feat/…` / `fix/…` / `chore/…` від `main`. Якщо на `main`
   є чужі незакомічені зміни — спершу питає, що з ними робити.
2. **План.** Досліджує код (за потреби — субагент `researcher`) і показує план:
   що змінюється в db / backend / frontend, кроки = майбутні коміти, як
   перевіримо, ризики. **Далі чекає твого «ок»** — до підтвердження код не змінюється.
   Хочеш інакше — просто напиши правки до плану.
3. **Реалізація.** Пише код у головній сесії; після кожного кроку —
   typecheck/build і коміт за Conventional Commits (`feat(db): …`,
   `feat(backend): …`, `feat(frontend): …`).
4. **Рев'ю.** Субагент `reviewer` незалежно читає `git diff main...HEAD`.
   BLOCKER/MAJOR виправляються окремими `fix:`-комітами.
5. **Тести.** Субагент `tester`: `npm run typecheck` + `npm test` (backend),
   `npm run build` (frontend), звірка i18n-ключів `en`/`uk`, ручний сценарій
   у dev-стеку, якщо змінилась поведінка.
6. **Звіт.** Гілка, коміти, що перевірено, ризики й команда для push.
   **Push і PR робиш ти** — Claude не пушить без явного прохання.

Дрібне питання чи однорядкову правку можна просто написати в чат, без `/feature`.

### Команди

| Команда | Коли |
| :-- | :-- |
| `/feature <опис>` | нова фіча, фікс або зміна — головний вхід |
| `/review-changes [base]` | незалежне рев'ю поточної гілки перед PR (база — `main`) |
| `/update-context [since:<ref>]` | після відчутних змін (схема БД, прогресія, імпорт, Docker, стек) — точково оновлює `CLAUDE.md`. Вручну, не автоматично |

### Субагенти (`.claude/agents/`)

- `researcher` — дослідження коду чи бібліотеки, звіт із `file:line`; файли не редагує.
- `reviewer` — друга думка на дифф: BLOCKER / MAJOR / MINOR з доказами; код не править.
- `tester` — тести й перевірка в dev-стеку; не глушить падаючі тести.

Код пише головна сесія — окремий «implementer» для соло-проєкту зайвий.

### Git-правила (`.claude/rules/git-workflow.md`)

- Одна фіча — одна гілка (`feat/workout-notes`), кілька комітів.
- Коміти: `feat:` / `fix:` / `chore:` / `refactor:` / `test:` / `docs:`, опційно зі scope.
- У `main` — лише через PR: **push у `main` запускає деплой на VPS**.

### Захист

- **`.claude/hooks/guard.mjs`** (PreToolUse, Node — працює і на Windows) блокує
  незалежно від того, що «вирішить» модель:
  - читання/зміну `.env*` (крім `.env.example`) — і через інструменти, і через shell;
  - `rm -rf`, `git reset --hard`, `git clean -f`, `docker compose down -v`,
    `docker volume rm`, `DROP`/`TRUNCATE` у shell;
  - force-push, `--no-verify`;
  - коміт або push, коли поточна гілка — `main`.
- **`.claude/settings.json`** — дозволи:
  - без питань: `git status/diff/log/add/commit/switch`, тести, typecheck, build, логи dev-стеку;
  - з підтвердженням: `git push`, `merge`, `rebase`, `npm install`, міграції БД;
  - заборонено: `.env`, `backups/` (дампи з хешами паролів і токенами).

Якщо хук щось заблокував, а дія справді потрібна — виконай її вручну в терміналі.

### Як розширювати

- Нове правило для Claude → файл у `.claude/rules/` + `@`-посилання в `CLAUDE.md`.
- Нова команда → `.claude/skills/<назва>/SKILL.md`.
- Ще одна заборона → регулярка в `rules` всередині `guard.mjs` або рядок у
  `permissions.deny` у `settings.json`.

## Розробка без Docker (опційно)

```bash
# backend
cd backend
npm install
cp ../.env.example .env   # відредагуйте DATABASE_URL на свій локальний Postgres
npm run db:migrate
npm run dev

# frontend (в іншому терміналі)
cd frontend
npm install
npm run dev
```
