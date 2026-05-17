#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s <previous-image-tag>\n' "$0" >&2
  exit 2
fi

COMPOSE_FILE="${COMPOSE_FILE:-compose.demo.yml}"
ENV_FILE="${ENV_FILE:-.env.demo}"
PREVIOUS_TAG="$1"

IMAGE_TAG="$PREVIOUS_TAG" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull
IMAGE_TAG="$PREVIOUS_TAG" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
