# Preparación común de los scripts test-*.sh: se carga con `source` desde cada uno.
# Define COMPOSE, levanta postgres, exporta DATABASE_URL/DIRECT_URL contra la base de
# trabajo `alphataco`. Cada script aplica luego las migraciones y exporta sus variables
# propias (JOBS_TOKEN, BETTER_AUTH_SECRET, ...).
# Requiere `set -euo pipefail` y estar parado en la raíz del repo (lo hace el llamador).

if [ ! -f .env.docker ]; then
  echo "Falta .env.docker (copiar de .env.docker.example y completar valores)." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.docker
set +a

COMPOSE=(docker compose --env-file .env.docker)

echo "==> Levantando postgres..."
"${COMPOSE[@]}" up -d --wait postgres

export DATABASE_URL="postgresql://alphataco:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-5432}/alphataco"
export DIRECT_URL="${DATABASE_URL}"
