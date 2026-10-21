#!/usr/bin/env bash
# Respaldo de la base de una instancia: pg_dump en formato personalizado, verificado y con retención.
#
#   scripts/backup/backup.sh --container <postgres> --user <usuario> --db <base> --out <carpeta> [--keep 14]
#
# - Escribe <carpeta>/<base>-AAAAMMDD-HHMMSS.dump. Primero a un archivo temporal: si pg_dump falla, el archivo está vacío
#   o `pg_restore --list` no lo puede leer, NO queda un respaldo "bueno" a medias y el script sale con error.
# - Conserva los últimos N respaldos de esa base (14 por defecto) y borra los más viejos SOLO después de verificar el nuevo.
# - El almacenamiento de archivos (RustFS) no está en el volcado: se respalda aparte (ver docs/deploy/runbook.md).
# Pensado para correr desde el cron del host (por ejemplo, 03:30 todos los días).
set -euo pipefail

container=""; user=""; db=""; out=""; keep=14
while [ $# -gt 0 ]; do
  case "$1" in
    --container) container="$2"; shift 2 ;;
    --user) user="$2"; shift 2 ;;
    --db) db="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --keep) keep="$2"; shift 2 ;;
    *) echo "Argumento desconocido: $1" >&2; exit 2 ;;
  esac
done
for v in container user db out; do
  [ -n "${!v}" ] || { echo "Falta --${v}" >&2; exit 2; }
done
case "$keep" in ''|*[!0-9]*) echo "--keep debe ser un número" >&2; exit 2 ;; esac
[ "$keep" -ge 1 ] || { echo "--keep debe ser al menos 1" >&2; exit 2; }

mkdir -p "$out"
stamp="$(date +%Y%m%d-%H%M%S)"
final="$out/${db}-${stamp}.dump"
tmp="${final}.partial"
trap 'rm -f "$tmp"' EXIT

docker exec "$container" pg_dump -U "$user" -Fc "$db" > "$tmp"
[ -s "$tmp" ] || { echo "El volcado quedó vacío: no se conserva." >&2; exit 1; }
docker exec -i "$container" pg_restore --list < "$tmp" > /dev/null \
  || { echo "El volcado no se puede leer con pg_restore: no se conserva." >&2; exit 1; }

mv "$tmp" "$final"
trap - EXIT
echo "Respaldo OK: $final ($(du -h "$final" | cut -f1))"

# Retención: se queda con los N más nuevos de esta base.
ls -1t "$out/${db}-"*.dump 2>/dev/null | tail -n +"$((keep + 1))" | while read -r old; do
  rm -f -- "$old"
  echo "Borrado por retención: $old"
done
