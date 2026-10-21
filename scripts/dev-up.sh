#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.docker ] || { cp .env.docker.example .env.docker; echo "Creado .env.docker: completá las contraseñas"; exit 1; }
docker compose --env-file .env.docker up -d --wait postgres storage

# Los buckets los crea el mismo script que corre el entrypoint de la imagen (única lista: STORAGE_BUCKETS).
set -a
# shellcheck disable=SC1091
source .env.docker
set +a
S3_ENDPOINT="http://127.0.0.1:${STORAGE_PORT:-${MINIO_PORT:-9000}}" node scripts/ensure-buckets.ts

docker compose --env-file .env.docker ps
