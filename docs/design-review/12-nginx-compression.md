# 12 · Стиснення відповідей у nginx

Гілка: `chore/nginx-compression`. Знахідка прод-рев'ю P01. Лише інфраструктура.
Закриває `DESIGN_PRINCIPLES.md` §9 («Логування не губить підхід офлайн» — у залі слабкий
сигнал, тож кожен кілобайт важить) і §1 (мобайл першочерговий).

## Що зараз

Виміряно на проді 2026-10-26 (`PROD-REVIEW-2026-10-26.md`, P01):

```
/assets/index-hHmcRmJi.js          874 KB  content-encoding: —  (transfer = decoded)
/api/workouts?page=1&pageSize=20   134 KB  JSON, без стиснення
/assets/index-*.css                 28 KB
перший вхід у журнал (мобайл)     1076 KB
```

`grep -i gzip nginx/ frontend/nginx.frontend.conf` — нічого. Стискати ніхто не стискає:
ні зовнішній nginx (`nginx/templates/default.conf.template`), ні nginx фронтенд-контейнера
(`frontend/nginx.frontend.conf`). У dev цього не видно — Vite віддає модулі по одному.

## Що зробити

1. У `nginx/templates/default.conf.template`, у `server` на 443 (поруч з
   `client_max_body_size`), увімкнути gzip для всього, що проходить через проксі —
   і статики фронтенду, і `/api`, і `/mcp`:
   ```nginx
   gzip on;
   gzip_vary on;
   gzip_proxied any;          # відповіді з upstream (backend, frontend, mcp) теж
   gzip_comp_level 5;
   gzip_min_length 1024;
   gzip_types text/plain text/css application/javascript application/json
              application/manifest+json image/svg+xml text/calendar;
   ```
   `text/html` стискається за замовчуванням. `text/calendar` — ICS-фід.
2. Brotli не обов'язковий: офіційний образ `nginx` його не має, а gzip дає основний
   виграш. Якщо колись — окремою задачею (образ з модулем або pre-compressed `.br` у збірці).
3. Нічого не чіпати в `Cache-Control`: `immutable` для `/assets/` і `no-cache` для
   `index.html` налаштовані правильно, `gzip_vary on` додає `Vary: Accept-Encoding`.
4. `deploy.yml` уже рестартує nginx, коли змінилось щось у `nginx/` (див. CLAUDE.md, «Прод:
   HTTPS») — окремих кроків не треба.

## Перевірка

- Після деплою:
  ```bash
  curl -sI -H 'Accept-Encoding: gzip' https://my-gym-com.duckdns.org/assets/<бандл>.js | grep -i -E 'content-encoding|vary'
  curl -sI -H 'Accept-Encoding: gzip' https://my-gym-com.duckdns.org/api/health | grep -i content-encoding   # або будь-який JSON ≥ 1 KB
  ```
  Очікувано `content-encoding: gzip` і `vary: Accept-Encoding`.
- DevTools → Network на журналі (жорстке перезавантаження): у колонці Size бандл ≈ 250–300 KB
  замість 874 KB; `/api/workouts` у кілька разів менший.
- ICS-фід календаря відкривається в Google/Apple як раніше.
- Повторити прод-рев'ю мережі (`PROD-REVIEW-2026-10-26.md`, «Метод») і записати нові цифри в P01.
