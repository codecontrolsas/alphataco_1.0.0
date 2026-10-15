/**
 * Re-export de la capa única de roles/permisos (P2 — Task 1: "Permissions + UserPermissionsManager
 * sobre Prisma y callFunction, capa única"). La implementación real vive en
 * `src/features/Permissions/actions/roles.server.ts`: este módulo sólo reexporta para no romper
 * los imports existentes (`@/features/UserPermissionsManager/actions.server`).
 */
export type {
  AllRolePermissionsMap,
  ModulesWithTabsData,
  RoleWithCount,
  UserDetailData,
  UserPermissionEntry,
  UserPermissionsData,
  UserRoleEntry,
  UserRolesData,
  UsersForRoleData,
} from '@/features/Permissions/actions/roles.server';

export {
  applyUserPermissionChanges,
  assignRoleToUserServer,
  cleanAllUserPermissionsAndRoles,
  cleanUserCustomPermissions,
  createRoleWithPermissions,
  deleteRoleServer,
  getAllRolePermissions,
  getAllRolesWithCounts,
  getModulesWithTabsServer,
  getRolePermissionsServer,
  getUserDetailById,
  getUserPermissionsForUserServer,
  getUserRolesServer,
  getUsersForRoleAssignment,
  removeRoleFromUserServer,
  updateRoleWithPermissions,
} from '@/features/Permissions/actions/roles.server';
