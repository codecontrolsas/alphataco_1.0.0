#!/bin/sh
# Arranque del contenedor de produccion: migra, siembra si se pide y levanta Next.
set -e

PRISMA="node ./node_modules/prisma/build/index.js"

echo "[entrypoint] prisma migrate deploy..."
$PRISMA migrate deploy

# Control de módulos (F3): pertenencia pestaña → módulo desde el catálogo del código. Si falla, se corta el arranque
# (`set -e`): una pertenencia vieja dejaría pestañas de módulos apagados a la vista (o al revés).
echo "[entrypoint] sincronizando el catálogo de módulos..."
node scripts/sync-module-catalog.ts

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

# Instancias que muestran TODO (la demo): ENABLE_ALL_MODULES=true enciende todos los módulos en cada arranque, de forma
# idempotente (una clave ya encendida no se toca ni se audita de nuevo; también borra los apagados por empresa).
# Nunca en la instancia de un cliente: ahí lo contratado se enciende por la API de administración. Va después del seed.
if [ "$ENABLE_ALL_MODULES" = "true" ]; then
  echo "[entrypoint] ENABLE_ALL_MODULES=true -> encendiendo todos los modulos..."
  node scripts/enable-all-modules.ts --allow-production
fi

echo "[entrypoint] arrancando Next standalone en ${HOSTNAME:-0.0.0.0}:${PORT:-3000}..."
exec node server.js
