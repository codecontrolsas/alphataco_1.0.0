import type { ModulesWithTabsData } from '../actions.server';

/** Módulo con sus pestañas, tal como lo arma `getModulesWithTabsServer`. */
export type PermissionModule = ModulesWithTabsData[number];
/** Pestaña (o sub-pestaña) con sus acciones permitidas y sus hijas. */
export type PermissionTab = PermissionModule['tabs'][number];
/** Acción de una pestaña, ya con nombre y descripción resueltos del catálogo. */
export type PermissionAction = PermissionTab['actions'][number];

/** Par que se guarda en `role_permissions` / `user_permissions`. */
export type PermissionPair = { tabId: string; actionId: string };

/** Estado de un ajuste personal sobre un permiso: heredar del rol, conceder o quitar. */
export type OverrideState = 'inherit' | 'grant' | 'deny';

/** Rol del que sale un permiso (para mostrar "del rol X"). */
export type RoleSourceRef = { id: number; name: string; color: string | null };

/** Atajo por sección o módulo. */
export type PermissionPreset = 'none' | 'view' | 'all';
