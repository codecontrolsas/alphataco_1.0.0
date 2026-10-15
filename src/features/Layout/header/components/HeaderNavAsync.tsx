import { getUserAccessibleModulesServer, getUserPermissionsMapServer } from '@/features/Permissions';
import { resolveVisibleTabs } from '../../sidebar/utils/tabs-visibility';
import { HeaderNav } from './HeaderNav';

/**
 * Async Server Component — resuelve qué módulos y secciones ve el usuario (mismos datos que el
 * sidebar) y le pasa al cliente solo slugs: los íconos son componentes y no viajan por props,
 * el cliente los reconstruye con `buildSidebarItems(navigationLinks, …)`.
 */
export async function HeaderNavAsync() {
  const [accessibleModules, permissions] = await Promise.all([
    getUserAccessibleModulesServer(),
    getUserPermissionsMapServer(),
  ]);

  return (
    <HeaderNav
      accessibleModuleSlugs={accessibleModules.map((module) => module.module_slug)}
      visibleTabs={resolveVisibleTabs(permissions)}
    />
  );
}
