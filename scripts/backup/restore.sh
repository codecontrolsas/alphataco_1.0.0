#!/usr/bin/env bash
# Restaura un respaldo en una base NUEVA (nunca pisa una existente).
#
#   scripts/backup/restore.sh --container <postgres> --user <usuario> --db <base_nueva> --file <respaldo.dump>
#
# - Crea <base_nueva> y restaura ahí. Si ya existe, aborta: para reemplazar una base en uso, restaurar con otro nombre,
#   comprobarla y recién entonces apuntar `DATABASE_URL` a ella (ver "Respaldo de la base antes de una migración de riesgo"
#   en docs/deploy/runbook.md).
# - Al final compara contra el respaldo la cantidad de tablas y filas de `_prisma_migrations` y falla si no coinciden.
set -euo pipefail

container=""; user=""; db=""; file=""
while [ $# -gt 0 ]; do
  case "$1" in
    --container) container="$2"; shift 2 ;;
    --user) user="$2"; shift 2 ;;
    --db) db="$2"; shift 2 ;;
    --file) file="$2"; shift 2 ;;
    *) echo "Argumento desconocido: $1" >&2; exit 2 ;;
  esac
done
for v in container user db file; do
  [ -n "${!v}" ] || { echo "Falta --${v}" >&2; exit 2; }
done
[ -s "$file" ] || { echo "El respaldo no existe o está vacío: $file" >&2; exit 1; }
case "$db" in *[!a-zA-Z0-9_]*|'') echo "--db solo admite letras, números y _" >&2; exit 2 ;; esac

exists="$(docker exec "$container" psql -U "$user" -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$db'")"
[ -z "$exists" ] || { echo "La base '$db' ya existe: se restaura siempre en una base nueva." >&2; exit 1; }

docker exec "$container" createdb -U "$user" "$db"
if ! docker exec -i "$container" pg_restore -U "$user" -d "$db" --no-owner --exit-on-error < "$file"; then
  echo "La restauración falló: se elimina la base '$db' incompleta." >&2
  docker exec "$container" dropdb -U "$user" "$db" || true
  exit 1
fi

tables="$(docker exec "$container" psql -U "$user" -d "$db" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"
expected="$(docker exec -i "$container" pg_restore --list < "$file" | grep -c ' TABLE public ' || true)"
echo "Restaurado en '$db': $tables tablas en public (el respaldo declara $expected)."
[ "$tables" = "$expected" ] || { echo "La cantidad de tablas no coincide con el respaldo." >&2; exit 1; }
