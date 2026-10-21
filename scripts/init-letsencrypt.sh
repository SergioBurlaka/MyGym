#!/bin/sh
# Перше отримання сертифіката Let's Encrypt для домену з .env (DOMAIN).
# Запускається ОДИН раз з кореня репозиторію:  sh scripts/init-letsencrypt.sh
# Далі сертифікат поновлює контейнер certbot сам.
#
# Чому окремий скрипт: nginx не стартує без файлів сертифіката, а
# сертифіката ще немає. Тому на хвилину зупиняємо nginx і даємо certbot
# самому відповісти Let's Encrypt на 80-му порту.
set -e

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Немає файлу .env - спершу: cp .env.example .env і заповніть його"
  exit 1
fi

# Читаємо лише дві потрібні змінні, а не `. ./.env`: синтаксис .env для
# Compose - не shell, і пароль із `$`/`&`/пробілом зламав би скрипт.
# tr прибирає \r (файл редагували на Windows) і лапки навколо значення.
env_value() {
  grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | tr -d '\r"'"'"
}
DOMAIN=$(env_value DOMAIN)
CERTBOT_EMAIL=$(env_value CERTBOT_EMAIL)

if [ -z "$DOMAIN" ] || [ -z "$CERTBOT_EMAIL" ]; then
  echo "У .env мають бути заповнені DOMAIN і CERTBOT_EMAIL"
  exit 1
fi

# STAGING=1 sh scripts/init-letsencrypt.sh - пробний прогін на тестовому
# сервері Let's Encrypt (без лімітів, але сертифікат браузер не прийме).
STAGING_FLAG=""
if [ "${STAGING:-0}" = "1" ]; then
  STAGING_FLAG="--staging"
  echo "Режим STAGING: тестовий сертифікат"
fi

# Наявність сертифіката дивимось за renewal-конфігом certbot: на відміну
# від live/ (root, 0700) його можна прочитати, і в ньому видно, з якого
# сервера Let's Encrypt (бойового чи staging) отримано сертифікат.
RENEWAL_CONF="certbot/conf/renewal/$DOMAIN.conf"
if [ -f "$RENEWAL_CONF" ]; then
  if grep -q "acme-staging" "$RENEWAL_CONF" && [ -z "$STAGING_FLAG" ]; then
    # Інакше після пробного прогону справжній сертифікат не отримати:
    # скрипт бачив би файл і виходив, а renew не перемикається з staging.
    echo "Є лише тестовий (STAGING) сертифікат - видаляю його, щоб отримати справжній..."
    docker compose run --rm --entrypoint rm certbot -rf \
      "/etc/letsencrypt/live/$DOMAIN" \
      "/etc/letsencrypt/archive/$DOMAIN" \
      "/etc/letsencrypt/renewal/$DOMAIN.conf"
  else
    echo "Сертифікат для $DOMAIN вже є - нічого робити не треба."
    exit 0
  fi
fi

mkdir -p certbot/conf certbot/www

echo "Зупиняю nginx, щоб звільнити порт 80..."
docker compose stop nginx || true

echo "Отримую сертифікат для $DOMAIN..."
docker compose run --rm --publish 80:80 --entrypoint certbot certbot \
  certonly --standalone \
  -d "$DOMAIN" \
  --email "$CERTBOT_EMAIL" \
  --agree-tos --no-eff-email \
  $STAGING_FLAG

echo "Запускаю весь стек..."
docker compose up -d

echo "Готово: https://$DOMAIN"
