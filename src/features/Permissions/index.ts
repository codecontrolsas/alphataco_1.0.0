/**
 * Sistema de Permisos - Exports centralizados
 *
 * Este archivo exporta todos los componentes, hooks y utilidades
 * del sistema de permisos para facilitar su importación.
 */

// Componentes
export { PermissionGuard } from './components/PermissionGuard';
export { PermissionGuardServer } from './components/PermissionGuardServer';

// Hooks
export { usePermissions } from './hooks/usePermissions';

// Server Actions — verificación de permisos (capa única sobre Prisma + callFunction)
export {
  canViewServer,
  checkMultiplePermissionsServer,
  checkPermissionServer,
  getUserAccessibleModulesServer,
  getUserPermissionsMapServer,
  getUserPermissionsServer,
} from './actions/permissions.server';

// Server Actions — CRUD de roles/permisos (Prisma)
export {
  applyUserPermissionChanges,
  assignRoleToUserServer,
  createRoleWithPermissions,
  deleteRoleServer,
  getAllRolePermissions,
  getAllRolesWithCounts,
  getModulesWithTabsServer,
  getRolePermissionsServer,
  getUserRolesServer,
  getUsersForRoleAssignment,
  removeRoleFromUserServer,
  updateRoleWithPermissions,
} from './actions/roles.server';

// Mapa de permisos y tipos
export { ACTIONS, PERMISSIONS, getSubtabId, getTabId } from './permissions-map';
export type { ActionSlug, AllTabSlugs, ModuleSlug, SubtabSlug, TabSlug } from './permissions-map';
