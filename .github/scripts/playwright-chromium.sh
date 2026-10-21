#!/usr/bin/env bash
# Deja Chromium de Playwright listo para correr. Pensado para lanzarse en segundo plano mientras el job
# levanta la instancia (ver _e2e.yml): el navegador no depende de ella.
#
#   1. `playwright install chromium` baja el navegador (~/.cache/ms-playwright, restaurado por actions/cache:
#      con cache es un no-op).
#   2. Las dependencias del sistema (apt) solo se instalan si `ldd` dice que faltan librerias. El runner de
#      GitHub ya trae casi todo; el `apt-get update` que hace `--with-deps` costaba ~20 s por job.
#
# Al terminar escribe el codigo de salida en $1 (archivo de estado) para que otro paso lo espere.
set -uo pipefail

STATUS_FILE="${1:?uso: playwright-chromium.sh <archivo-de-estado>}"

run() {
  set -e
  npx playwright install chromium

  missing=0
  found=0
  while IFS= read -r bin; do
    found=1
    if ldd "$bin" 2>/dev/null | grep -q 'not found'; then
      echo "faltan librerias para $bin:"
      ldd "$bin" | grep 'not found'
      missing=1
    fi
  done < <(find "$HOME/.cache/ms-playwright" -type f \( -name headless_shell -o -name chrome-headless-shell -o -name chrome \) 2>/dev/null)

  if [ "$found" = 0 ] || [ "$missing" = 1 ]; then
    echo "instalando dependencias del sistema de Chromium"
    # apt-get update toca TODAS las fuentes del runner; la de Google Chrome da `Hash Sum mismatch` de vez en
    # cuando y no hace falta para Chromium de Playwright.
    sudo rm -f /etc/apt/sources.list.d/google*.list
    for i in 1 2 3; do
      if sudo apt-get update && npx playwright install-deps chromium; then
        return 0
      fi
      echo "apt intento $i fallo; reintento en $((i * 5))s..."
      sleep $((i * 5))
    done
    return 1
  fi
  echo "Chromium y sus librerias ya estan listos"
}

( run )
code=$?
echo "$code" > "$STATUS_FILE"
exit "$code"
