# Habilita los roles de la base que usa la app con RLS y exporta sus URLs para las suites de integración bajo RLS
# (`src/test/rls-roles.ts`). Se carga con `source` DESPUÉS de `integration-env.sh` y de `prisma migrate deploy`:
# los roles nacen NOLOGIN en la migración `app_and_system_roles`.
#   alphataco_app    : el de la app (sin BYPASSRLS: las políticas le aplican).
#   alphataco_system : jobs, sesión, alta de empresa (BYPASSRLS).
# Mismas contraseñas que `docker-compose.rls.yml` y el e2e-rls: solo para CI y desarrollo local.

echo "==> Habilitando los roles alphataco_app y alphataco_system..."
"${COMPOSE[@]}" exec -T postgres psql -U alphataco -d alphataco -v ON_ERROR_STOP=1 -q \
  -c "ALTER ROLE alphataco_app LOGIN PASSWORD 'rlsapp'" \
  -c "ALTER ROLE alphataco_system LOGIN PASSWORD 'rlssystem'"

export RLS_APP_DATABASE_URL="postgresql://alphataco_app:rlsapp@127.0.0.1:${POSTGRES_PORT:-5432}/alphataco"
export RLS_SYSTEM_DATABASE_URL="postgresql://alphataco_system:rlssystem@127.0.0.1:${POSTGRES_PORT:-5432}/alphataco"
