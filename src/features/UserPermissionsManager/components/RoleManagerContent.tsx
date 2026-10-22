import { getAllRolePermissions, getAllRolesWithCounts, getModulesWithTabsServer } from '@/features/Permissions/actions/roles.server';
import { RoleManager } from './RoleManager';

/**
 * Server Component que carga los datos iniciales para la gestión de roles.
 * Ejecuta las 3 queries en paralelo y pasa los datos al Client Component.
 */
export async function RoleManagerContent() {
  const [rolesWithCounts, allRolePermissionsMap, modulesWithTabs] = await Promise.all([
    getAllRolesWithCounts(),
    getAllRolePermissions(),
    getModulesWithTabsServer(),
  ]);

  // Serializar el Map a objeto plano para que sea pasable como prop de Server → Client
  const allRolePermissionsObj: Record<number, Array<{ tabId: string; actionId: string }>> = {};
  allRolePermissionsMap.forEach((perms, roleId) => {
    allRolePermissionsObj[roleId] = perms;
  });

  return (
    <RoleManager
      initialRoles={rolesWithCounts}
      initialRolePermissions={allRolePermissionsObj}
      initialModules={modulesWithTabs}
    />
  );
}
