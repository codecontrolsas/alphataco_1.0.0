import type { ActionSlug, TabSlug } from '@/features/Permissions/permissions-map';

export type WarehouseTab = TabSlug<'almacenes'>;

/** Mapa de permisos `"modulo:tab:accion" → boolean` que arma `getUserPermissionsMapServer()`. */
export type PermissionsMap = Record<string, boolean>;

/**
 * Consulta tipada del mapa de permisos para Almacenes. La clave armada a mano no la verifica
 * TypeScript: si un tab se renombra, `'almacenes:stock:view'` pasaria a ser `undefined` y el
 * boton desapareceria sin que nada falle. Aca el tab y la accion son literales tipados.
 */
export function canWarehouse(permissions: PermissionsMap, tab: WarehouseTab, action: ActionSlug): boolean {
  return permissions[`almacenes:${tab}:${action}`] === true;
}
