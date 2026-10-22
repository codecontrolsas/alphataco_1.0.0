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

# shellcheck source=lib/integration-env.sh
source scripts/lib/integration-env.sh

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
