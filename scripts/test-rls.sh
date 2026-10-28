#!/usr/bin/env bash
# npm run test:rls — integración bajo los roles REALES de la base: el código de la app conecta como `alphataco_app`
# (sin BYPASSRLS, las políticas le aplican) y el de sistema como `alphataco_system`, igual que la demo y el e2e-rls.
#
# Los demás tests de integración corren como el dueño de las tablas, que saltea la RLS. Por eso no vieron:
# - las listas `'use cache'` vacías (sin empresa en el contexto la RLS devuelve cero filas, y se cachean): Usuarios,
#   Taller, Aprobaciones;
# - las preferencias de tabla que nunca se guardaban (la política no coincidía con la clave);
# - el tipo «Diagnóstico» oculto que bloqueaba crear uno propio con ese nombre;
# - el alta de usuario que escribía `auth_*` con el rol de la app (cerradas a ese rol) y no veía perfiles de otra empresa.
# - el usuario sin empresa activa (primer ingreso) que no veía ni su propio perfil y no podía crear su primera empresa.
# Los jobs bajo RLS se prueban en `test-jobs.sh` (misma preparación de roles).
#
# Usa la base de trabajo `alphataco`; cada suite crea y borra sus propias empresas de prueba.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck source=lib/integration-env.sh
source scripts/lib/integration-env.sh

echo "==> Aplicando migraciones pendientes..."
npx prisma migrate deploy
enable_all_modules

# shellcheck source=lib/rls-roles.sh
source scripts/lib/rls-roles.sh

echo "==> Corriendo los tests de integracion bajo RLS..."
npx vitest run --no-file-parallelism \
  src/shared/lib/cached-lists.rls.integration.test.ts \
  src/shared/lib/user-flows.rls.integration.test.ts \
  src/features/Auth/actions/register-user.rls.integration.test.ts \
  src/features/Hse/hse-documents.rls.integration.test.ts \
  src/features/Hse/hse-trainings.rls.integration.test.ts \
  src/features/Hse/hse-records.rls.integration.test.ts \
  src/features/Employees/EmpleadoID/PortalAccess/portal-access.rls.integration.test.ts \
  src/features/Dashboard/Boards/dashboard-presets.rls.integration.test.ts \
  src/shared/lib/instance-settings.rls.integration.test.ts \
  src/features/Empresa/General/first-company.rls.integration.test.ts \
  src/features/MobileApi/employees/mobile-employees.rls.integration.test.ts \
  src/features/Modules/modules.rls.integration.test.ts
