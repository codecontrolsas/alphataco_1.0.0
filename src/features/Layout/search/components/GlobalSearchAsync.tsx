import { getUserAccessibleModulesServer, getUserPermissionsMapServer } from '@/features/Permissions';
import { navigationLinks } from '../../sidebar/constants/navigation';
import { buildSidebarItems } from '../../sidebar/utils/sidebar.utils';
import { resolveVisibleTabs } from '../../sidebar/utils/tabs-visibility';
import { GlobalSearch, type SearchScreen } from './GlobalSearch';

/**
 * Async Server Component del buscador "Ir a…": resuelve en el servidor las pantallas que el usuario
 * puede abrir (la misma regla que el menú) y se las pasa al cliente. Las personas, unidades y
 * clientes se buscan bajo demanda (`searchGlobalResources`).
 */
export async function GlobalSearchAsync() {
  const [accessibleModules, permissions] = await Promise.all([
    getUserAccessibleModulesServer(),
    getUserPermissionsMapServer(),
  ]);

  const items = buildSidebarItems(
    navigationLinks,
    accessibleModules.map((module) => module.module_slug),
    resolveVisibleTabs(permissions)
  );

  const screens: SearchScreen[] = items.flatMap((item) => [
    { label: item.name, href: item.href },
    ...(item.items ?? []).map((sub) => ({
      label: `${item.name} › ${sub.name}`,
      href: `${item.href}?tab=${sub.tabSlug}`,
    })),
  ]);

  const modules = new Set(accessibleModules.map((module) => module.module_slug));

  return (
    <GlobalSearch
      screens={screens}
      scopes={{ people: modules.has('empleados'), fleet: modules.has('equipos'), clients: modules.has('comercial') }}
    />
  );
}
