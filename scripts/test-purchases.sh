#!/usr/bin/env bash
# npm run test:purchases — integracion de Compras (proveedores y solicitudes de compra) contra
# el Postgres del compose: CHECK de la base, el `FOR UPDATE` de las transiciones (dos
# aprobaciones simultaneas), la numeracion con advisory lock y el perimetro de empresa.
#
# Usa la base de trabajo `alphataco`, igual que el resto de los *.integration.test.ts. La suite
# crea y borra sus propias empresas de prueba.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck source=lib/integration-env.sh
source scripts/lib/integration-env.sh

echo "==> Aplicando migraciones pendientes..."
npx prisma migrate deploy

echo "==> Corriendo los tests de integracion de Compras..."
npx vitest run \
  src/features/Purchases/actions/suppliers.integration.test.ts \
  src/features/Purchases/actions/requests.integration.test.ts \
  src/features/Purchases/actions/orders.integration.test.ts \
  src/features/Purchases/actions/quotes.integration.test.ts \
  src/features/Purchases/actions/receipts.integration.test.ts \
  src/features/Purchases/actions/invoices.integration.test.ts \
  src/features/Purchases/actions/payments.integration.test.ts
