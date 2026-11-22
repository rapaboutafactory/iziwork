#!/bin/sh
# Фоновый контейнер: отдельный процесс db:retention, затем ожидание.
set -u
interval=${MAINTENANCE_INTERVAL_SECONDS:-86400}
case "$interval" in
  ''|*[!0-9]*) printf '%s\n' 'MAINTENANCE_INTERVAL_SECONDS должен быть целым числом' >&2; exit 2 ;;
esac
if [ "$interval" -lt 60 ]; then
  printf '%s\n' 'Минимальный интервал очистки — 60 секунд' >&2
  exit 2
fi
trap 'exit 0' TERM INT
while :; do
  pnpm db:retention || printf '%s\n' 'Очистка не выполнена; повтор по расписанию.' >&2
  sleep "$interval" &
  wait $! || exit 0
done
