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

set -a
. ./.env
set +a

if [ -z "$DOMAIN" ] || [ -z "$CERTBOT_EMAIL" ]; then
  echo "У .env мають бути заповнені DOMAIN і CERTBOT_EMAIL"
  exit 1
fi

if [ -f "certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
  echo "Сертифікат для $DOMAIN вже є - нічого робити не треба."
  exit 0
fi

mkdir -p certbot/conf certbot/www

# STAGING=1 sh scripts/init-letsencrypt.sh - пробний прогін на тестовому
# сервері Let's Encrypt (без лімітів, але сертифікат браузер не прийме).
STAGING_FLAG=""
if [ "${STAGING:-0}" = "1" ]; then
  STAGING_FLAG="--staging"
  echo "Режим STAGING: тестовий сертифікат"
fi

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
