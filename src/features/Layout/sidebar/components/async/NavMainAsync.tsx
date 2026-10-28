import {
  getUserAccessibleModulesServer,
  getUserPermissionsMapServer,
} from '@/features/Permissions/actions/permissions.server';
import { resolveVisibleTabs } from '../../utils/tabs-visibility';
import { NavMain } from '../NavMain';

/**
 * Async Server Component — resuelve qué módulos y qué tabs ve el usuario.
 * Se envuelve en Suspense desde `AppSidebar` para streaming independiente.
 *
 * El filtro de tabs se hace acá y no en el cliente a propósito: necesita `permissions-map`
 * entero, que no tiene por qué viajar al bundle.
 */
export async function NavMainAsync() {
  const [accessibleModules, permissions] = await Promise.all([
    getUserAccessibleModulesServer(),
    getUserPermissionsMapServer(),
  ]);

  return (
    <NavMain
      accessibleModuleSlugs={accessibleModules.map((module) => module.module_slug)}
      visibleTabs={resolveVisibleTabs(permissions)}
    />
  );
}
