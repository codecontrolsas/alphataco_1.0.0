#!/usr/bin/env bash
# npm run test:treasury — integracion de Tesoreria (cuentas, movimientos, transferencias, cobranzas y cheques) contra
# el Postgres del compose: CHECK de la base, el `FOR UPDATE` de las anulaciones (dos
# simultaneas), la numeracion con advisory lock, los saldos y el perimetro de empresa.
#
# Usa la base de trabajo `alphataco`, igual que el resto de los *.integration.test.ts. La suite
# crea y borra sus propias empresas de prueba.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck source=lib/integration-env.sh
source scripts/lib/integration-env.sh

echo "==> Aplicando migraciones pendientes..."
npx prisma migrate deploy
enable_all_modules

echo "==> Corriendo los tests de integracion de Tesoreria..."
npx vitest run \
  src/features/Treasury/actions/treasury.integration.test.ts \
  src/features/Treasury/actions/receipts.integration.test.ts \
  src/features/Treasury/actions/checks.integration.test.ts \
  src/features/Treasury/actions/reconciliation.integration.test.ts
