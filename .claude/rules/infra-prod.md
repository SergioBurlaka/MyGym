---
paths:
  - "nginx/**"
  - "docker-compose.yml"
  - ".github/workflows/**"
  - "scripts/**"
  - "backend/Dockerfile"
  - "frontend/Dockerfile"
  - "mcp-server/Dockerfile"
  - "frontend/nginx.frontend.conf"
---

# Прод: HTTPS, nginx, деплой

**Прод: HTTPS**: https://my-gym-com.duckdns.org, VPS
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
  `proxy_pass http://frontend:80` деплой, що перестворює контейнер (нова IP),
  лишає nginx зі старою адресою — 502 на весь сайт до `docker compose restart
  nginx`. Заодно nginx стартує й без
  якогось контейнера.
- HSTS навмисно `max-age=86400` — підняти до року, коли HTTPS стабільний.
- **Стиснення — лише тут:** gzip у `server` на 443 (`gzip_comp_level 5`,
  `gzip_min_length 1024`, `gzip_proxied any`, `gzip_vary on`); ні `backend`, ні `mcp`, ні
  контейнер `frontend` самі не стискають. Директиви на рівні `server`, тож діють на всі
  `location`, зокрема `/mcp`. `gzip_types`: `text/plain`, `text/css`, `text/javascript`,
  `application/javascript`, `application/json`, `application/manifest+json`,
  `image/svg+xml`, `text/calendar` (ICS-фід); `text/html` — за замовчуванням. Новий тип
  відповіді не стискається, поки його не дописати в `gzip_types`.
  `gzip_proxied` стосується запитів із заголовком `Via` (проксі оператора), а не відповідей
  upstream — ті стискаються й без нього.
- **Gotcha:** nginx стискає лише статуси 200, 403 і 404. Решта йде сирою: 201 (створення
  через `POST`), 401, 400, 409, 429, 5xx — перевіряти стиснення треба на запиті з токеном.
- `/mcp` відповідає JSON (`enableJsonResponse: true`, `GET` → 405), тож відповіді від
  `gzip_min_length` стискаються попри `proxy_buffering off`. `text/event-stream` нема в
  `gzip_types`: gzip його не чіпає, щоб не затримувати події в буфері.
- **Gotcha:** nginx рендерить конфіг із `nginx/templates` лише при старті
  контейнера, а `docker compose up -d` не перестворює його через зміну
  примонтованого файлу (і перечитування раз на 6 год бере старий готовий
  конфіг). Тому `deploy.yml` робить `restart nginx`, якщо між старим і новим
  HEAD змінилось щось у `nginx/`.
- Відома прогалина: `deploy.yml` не перевіряє, що контейнери реально
  піднялись (`docker compose up -d` зелений і при nginx у циклі рестартів).
