#!/usr/bin/env bash
# npm run test:auth — corre los tests de integracion de autenticacion (P4) contra el
# Postgres del compose. Son los que no se pueden reemplazar por tests unitarios: verifican
# que Better Auth RECHAZA de verdad los claims de empresa/legajo por HTTP, y que el hash de
# contrasena que escribimos en la transaccion del alta es el que la libreria verifica.
#
# Usa la base de trabajo `alphataco`, igual que el resto de los *.integration.test.ts. Cada
# suite crea y borra sus propios datos (empresa, profile, credencial).
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck source=lib/integration-env.sh
source scripts/lib/integration-env.sh
# El secreto solo tiene que existir y ser estable dentro de la corrida.
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-test-secret-solo-para-los-tests-de-auth}"
export NEXT_PUBLIC_BASE_URL="${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}"

echo "==> Aplicando migraciones pendientes..."
npx prisma migrate deploy
enable_all_modules

echo "==> Corriendo los tests de integracion de auth..."
npx vitest run \
  src/shared/lib/auth-claims.integration.test.ts \
  src/shared/lib/auth-credentials.integration.test.ts \
  src/shared/lib/auth-rate-limit.integration.test.ts \
  src/features/Auth/actions/register-user.integration.test.ts \
  src/features/Auth/actions/register-user.invitation.integration.test.ts

echo
echo "Los otros cuatro flujos (login del dashboard, QR, indumentaria y taller) van por la UI:"
echo "  docker compose --env-file .env.docker up -d --wait app"
echo "  node scripts/seed-auth-fixtures.ts"
echo "  npx cypress run --spec 'cypress/e2e/auth/p4-auth-flows.cy.ts'" 
