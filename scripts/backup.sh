#!/bin/sh
# Запускать из корня проекта на VPS: sh scripts/backup.sh [каталог]
set -eu
umask 077

backup_dir=${1:-./backups}
mkdir -p "$backup_dir"
stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
backup_file="$backup_dir/motiv-$stamp-$$.dump"
temporary_file="$backup_file.partial"
trap 'rm -f "$temporary_file"' EXIT HUP INT TERM

# Пароль читается из окружения уже запущенного контейнера, не из аргументов хоста.
# Custom format: консистентный логический снимок, пригодный для pg_restore.
docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$temporary_file"
test -s "$temporary_file"
mv "$temporary_file" "$backup_file"
trap - EXIT HUP INT TERM
printf 'Резервная копия: %s\n' "$backup_file"
printf 'Храните защищённую копию вне VPS и регулярно проверяйте восстановление.\n'
