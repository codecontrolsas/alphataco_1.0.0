#!/usr/bin/env bash
# npm run test:db — levanta postgres (imagen propia con pgTAP), crea/resetea
# la base alphataco_test, aplica migraciones + seed, y corre los tests
# pgTAP (prisma/tests/*.sql) con pg_prove. La base de trabajo `alphataco`
# NUNCA se toca.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.docker ]; then
  echo "Falta .env.docker (copiar de .env.docker.example y completar valores)." >&2
  exit 1
fi

set -a
source .env.docker
set +a

COMPOSE=(docker compose --env-file .env.docker)

echo "==> Levantando postgres..."
"${COMPOSE[@]}" up -d postgres

echo "==> Esperando a que postgres este healthy..."
CID="$("${COMPOSE[@]}" ps -q postgres)"
if [ -z "$CID" ]; then
  echo "No se encontro el contenedor de postgres." >&2
  exit 1
fi

elapsed=0
until [ "$(docker inspect --format '{{.State.Health.Status}}' "$CID")" = "healthy" ]; do
  if [ "$elapsed" -ge 60 ]; then
    echo "postgres no llego a 'healthy' en 60s." >&2
    exit 1
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done
echo "postgres healthy."

TEST_DB="alphataco_test"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

echo "==> Reseteando la base de datos de test ($TEST_DB)..."
"${COMPOSE[@]}" exec -T postgres psql -U alphataco -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid();"
"${COMPOSE[@]}" exec -T postgres psql -U alphataco -d postgres -v ON_ERROR_STOP=1 -c \
  "DROP DATABASE IF EXISTS ${TEST_DB};"
"${COMPOSE[@]}" exec -T postgres psql -U alphataco -d postgres -v ON_ERROR_STOP=1 -c \
  "CREATE DATABASE ${TEST_DB};"
"${COMPOSE[@]}" exec -T postgres psql -U alphataco -d "${TEST_DB}" -v ON_ERROR_STOP=1 -c \
  "CREATE EXTENSION IF NOT EXISTS pgtap;"

export DATABASE_URL="postgresql://alphataco:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${TEST_DB}"
export DIRECT_URL="${DATABASE_URL}"

echo "==> Aplicando migraciones contra ${TEST_DB}..."
npx prisma migrate deploy

echo "==> Seed de datos de prueba..."
npm run db:seed -- --name Test --id 00000000-0000-0000-0000-000000000001 --modules=all

echo "==> Corriendo pgTAP (pg_prove)..."
# El glob /tests/*.sql debe expandirse DENTRO del contenedor (el host no
# tiene ese path), asi que se delega a un shell remoto.
"${COMPOSE[@]}" exec -T postgres sh -c "pg_prove -U alphataco -d '${TEST_DB}' /tests/*.sql"

echo "==> Zona horaria de la conexion de Prisma..."
npx vitest run src/shared/lib/prisma-timezone.integration.test.ts
