#!/usr/bin/env bash
# npm run test:warehouses — integracion del motor de stock de Almacenes contra el Postgres del
# compose: saldos, costo promedio, lotes, serializados, anulaciones y concurrencia real (dos
# salidas simultaneas por el ultimo stock). Lo que un test unitario no puede probar: el
# `FOR UPDATE`, el advisory lock de la numeracion y los CHECK de la base.
#
# Usa la base de trabajo `alphataco`, igual que el resto de los *.integration.test.ts. La suite
# crea y borra sus propias empresas de prueba.
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
"${COMPOSE[@]}" up -d --wait postgres

export DATABASE_URL="postgresql://alphataco:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-5432}/alphataco"
export DIRECT_URL="${DATABASE_URL}"

echo "==> Aplicando migraciones pendientes..."
npx prisma migrate deploy

echo "==> Corriendo los tests de integracion de Almacenes..."
npx vitest run \
  src/features/Warehouses/lib/stock-engine.integration.test.ts \
  src/features/Warehouses/actions/prices-permission.integration.test.ts \
  src/features/Warehouses/actions/direct-exit.integration.test.ts \
  src/features/OperatorPanel/actions/materials.integration.test.ts \
  src/features/Mantenimiento/MaintenanceOrders/actions/materials.integration.test.ts \
  src/features/Warehouses/lib/clothing-materials.integration.test.ts \
  src/features/Clothing/ClothingDelivery/actions/deliveries.integration.test.ts \
  src/features/Mantenimiento/Gomeria/Ordenes/actions/tire-stock.integration.test.ts
