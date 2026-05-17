#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-compose.demo.yml}"
ENV_FILE="${ENV_FILE:-.env.demo}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U postgres -d sidechat -Fc \
  > "$BACKUP_DIR/sidechat-$STAMP.dump"

printf '%s\n' "$BACKUP_DIR/sidechat-$STAMP.dump"
