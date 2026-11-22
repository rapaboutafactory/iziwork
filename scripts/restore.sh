#!/bin/sh
# ВНИМАНИЕ: заменяет содержимое БД. Сначала остановите app/retention и сделайте backup.
# ALLOW_DATABASE_RESTORE=I_UNDERSTAND sh scripts/restore.sh ./backups/file.dump
set -eu
umask 077

if [ "${ALLOW_DATABASE_RESTORE:-}" != "I_UNDERSTAND" ]; then
  printf '%s\n' 'Восстановление заменяет текущие таблицы. Требуется ALLOW_DATABASE_RESTORE=I_UNDERSTAND.' >&2
  exit 2
fi
backup_file=${1:?Укажите путь к .dump-файлу}
test -f "$backup_file"
test -s "$backup_file"

running_services=$(docker compose ps --status running --services)
if printf '%s\n' "$running_services" | grep -Eq '^(app|retention)$'; then
  printf '%s\n' 'Сначала остановите запись: docker compose stop app retention caddy' >&2
  exit 2
fi

# Сначала проверяем, что архив читается; пароль не попадает в аргументы хоста.
docker compose exec -T db pg_restore --list < "$backup_file" > /dev/null
docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --single-transaction --exit-on-error' < "$backup_file"
printf '%s\n' 'База восстановлена. Выполните миграции при необходимости, затем запустите app/caddy/retention.'
