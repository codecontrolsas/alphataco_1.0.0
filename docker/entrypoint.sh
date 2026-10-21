#!/bin/sh
# Arranque del contenedor de produccion: migra, siembra si se pide y levanta Next.
set -e

PRISMA="node ./node_modules/prisma/build/index.js"

echo "[entrypoint] prisma migrate deploy..."
$PRISMA migrate deploy

# Crea los buckets de RustFS que falten (idempotente). Un bucket agregado en una version nueva se
# crea solo al desplegar. Si falla NO se corta el arranque: la web y el resto de la app siguen
# funcionando y /api/health informa `storage: error`, que deja rojo el workflow de deploy.
echo "[entrypoint] verificando buckets de RustFS..."
node scripts/ensure-buckets.ts || echo "[entrypoint] ERROR ensure-buckets: las subidas de archivos no funcionan hasta corregirlo"

# Solo para instancias nuevas (ver docs/deploy/runbook.md). El seed es idempotente
# (todo upsert, id de empresa derivado del nombre), asi que dejarlo prendido no
# duplica nada; pero con otro SEED_COMPANY_NAME crearia OTRA empresa, por eso se
# apaga despues del primer deploy.
if [ "$RUN_SEED" = "true" ]; then
  SEED_COMPANY_NAME="${SEED_COMPANY_NAME:-AlphaTaco}"
  echo "[entrypoint] RUN_SEED=true -> seed de empresa \"$SEED_COMPANY_NAME\" + catalogo de permisos..."
  node scripts/seed-company.ts --name "$SEED_COMPANY_NAME"
fi

echo "[entrypoint] arrancando Next standalone en ${HOSTNAME:-0.0.0.0}:${PORT:-3000}..."
exec node server.js
