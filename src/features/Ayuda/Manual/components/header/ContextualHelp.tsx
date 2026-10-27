import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import { visibleGuides } from '../../lib/guide-access';
import { getManual } from '../../lib/manual.server';
import { buildRouteTable } from '../../lib/route-table';
import { ContextualHelpButton } from './ContextualHelpButton';

/**
 * Botón "?" del header. La tabla pantalla → guía se arma acá, ya filtrada por permisos, y viaja
 * al cliente reducida a ruta + tab + subtab + slug: el cliente solo la compara con la URL actual.
 * Sin permiso para abrir el manual, no se muestra nada.
 */
export async function ContextualHelp() {
  const permissions = await getUserPermissionsMapServer();
  const isTabVisible = createTabVisibilityChecker(permissions);
  if (!isTabVisible('ayuda', 'manual')) return null;

  return <ContextualHelpButton rules={buildRouteTable(visibleGuides(getManual().guides, permissions))} />;
}
