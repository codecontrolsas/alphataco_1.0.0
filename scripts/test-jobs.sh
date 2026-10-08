#!/usr/bin/env bash
# npm run test:jobs — corre los tests de integracion de los tres jobs de P5 (`/api/jobs/*`)
# contra el Postgres del compose. Son los que no se pueden reemplazar por tests unitarios:
# verifican que el candado de idempotencia de `jobs_runs` REALMENTE impide un segundo envio,
# que las funciones SQL filtran por empresa, y que el token se rechaza de verdad por HTTP.
#
# El test monta DOS empresas con datos exclusivos y comprueba que el correo de una no
# contiene nada de la otra ni llega a sus destinatarios. Con una sola empresa esa propiedad
# es indistinguible de un job que manda todo a todos.
#
# El emisor SMTP se inyecta (se captura el mensaje en memoria): no hace falta un servidor de
# correo. Para verificar el envio real contra un SMTP, ver la seccion "Jobs" de
# docs/desarrollo/entornos.md (servicio `mailpit` del compose).
#
# Usa la base de trabajo `alphataco`, igual que el resto de los *.integration.test.ts. La
# suite crea y borra sus propios datos (empresas, clientes, empleados, partes, documentos).
#
# ATENCION, un efecto que SI toca datos ajenos al test: el job de indicadores corre
# `actualizar_estado_daily_reports()` y `marcar_prepartes_vencidos()`, que son GLOBALES (no
# reciben company_id). En una base de desarrollo con datos propios eso cierra partes diarios
# con fecha pasada y marca prepartes pendientes como vencidos, aunque no sean del test. Es el
# mismo efecto que tendria el job corriendo de verdad a las 00:30, y ambas operaciones son
# idempotentes, pero conviene saberlo antes de correrlo sobre una base que estas usando para
# probar otra cosa. En CI la base arranca vacia, asi que no aplica.
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
# El test fija su propio JOBS_TOKEN; este valor solo evita que quede indefinido al importar.
export JOBS_TOKEN="${JOBS_TOKEN:-devtoken}"
export NEXT_PUBLIC_BASE_URL="${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}"

echo "==> Aplicando migraciones pendientes..."
npx prisma migrate deploy

echo "==> Corriendo los tests de integracion de los jobs..."
# En secuencia (--no-file-parallelism): los jobs recorren TODAS las empresas de la base, y un
# archivo que crea y borra sus empresas de prueba en paralelo le cambia el universo al otro
# (se vio: daily-indicators leyo una empresa que el otro test borro y fallo por FK en jobs_runs).
npx vitest run --no-file-parallelism \
  src/features/Jobs/lib/auth.test.ts \
  src/features/Jobs/jobs/jobs.integration.test.ts \
  src/features/Jobs/jobs/warehouse-batch-expiry.integration.test.ts
