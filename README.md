# MyGym

Особистий щоденник тренувань (гантелі, штанга, лавка, стійки): записуєте підходи,
дивитесь графіки прогресу по кожній вправі і отримуєте нагадування, коли пора
додати вагу чи повторення.

## Стек

- **Backend:** Node.js + TypeScript, [Fastify](https://fastify.dev) + [Zod](https://zod.dev) (валідація), [Drizzle ORM](https://orm.drizzle.team) + drizzle-kit (міграції), PostgreSQL
- **Auth:** email + пароль (argon2), JWT access + refresh (refresh — httpOnly cookie, зберігається в БД для можливості відкликання)
- **Frontend:** React + TypeScript + Vite, Tailwind CSS, Recharts
- **Інфраструктура:** Docker (окремі контейнери: postgres, backend, frontend, nginx), docker-compose для dev (hot-reload) і prod, nginx як reverse-proxy на HTTP

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
# і надійний POSTGRES_PASSWORD

docker compose up --build -d
```

Застосунок буде доступний на порту `${NGINX_PORT:-80}` вашого сервера. nginx
проксує `/api/*` на backend і все інше — на статичний білд фронтенду.

SSL зараз не налаштований (reverse-proxy працює на HTTP). Коли буде готовий
домен, додайте certbot/Let's Encrypt і HTTPS server-блок у `nginx/nginx.conf`.

### Оновлення на сервері

```bash
git pull
docker compose up --build -d
```

Нові Drizzle-міграції застосовуються автоматично при старті backend-контейнера.

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
nginx/      Конфіг reverse-proxy для продакшна
docker-compose.yml       Продакшн-стек
docker-compose.dev.yml   Dev-стек з hot-reload
.env.example             Шаблон змінних середовища
```

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
