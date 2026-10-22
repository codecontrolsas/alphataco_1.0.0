import { canViewServer, checkPermissionServer } from '@/features/Permissions/actions/permissions.server';

/**
 * Permisos de servidor de la ficha de vehículos. Los slugs son los de `permissions-map.ts`
 * (módulo `equipos`) y los mismos que usan los `PermissionGuard` de la UI:
 * - alta: tab `vehicles` / `create` (botón "Nuevo" del listado)
 * - edición, baja/reintegro y cambio de condición: tab `detalle-equipo` / `update` (header de la ficha)
 * Módulo sin directiva: no es una server action, sólo lo importan las que sí lo son.
 */

const FORBIDDEN_MESSAGE = 'No tenés permiso para realizar esta acción';

export async function requireVehicleCreate(): Promise<void> {
  if (!(await checkPermissionServer('equipos', 'vehicles', 'create'))) throw new Error(FORBIDDEN_MESSAGE);
}

export async function requireVehicleUpdate(): Promise<void> {
  if (!(await checkPermissionServer('equipos', 'detalle-equipo', 'update'))) throw new Error(FORBIDDEN_MESSAGE);
}

/** Cambio de condición: la tab depende de la tabla del equipo (vehículo u otro equipo). */
export async function requireEquipmentConditionUpdate(table: 'vehicles' | 'other_equipment'): Promise<void> {
  const tab = table === 'vehicles' ? 'detalle-equipo' : 'detalle-otro-equipo';
  if (!(await checkPermissionServer('equipos', tab, 'update'))) throw new Error(FORBIDDEN_MESSAGE);
}

/** Ficha del vehículo: `view` de la tab (con la inferencia por subtabs de `canViewServer`). */
export async function requireVehicleView(): Promise<void> {
  if (!(await canViewServer('equipos', 'detalle-equipo'))) throw new Error(FORBIDDEN_MESSAGE);
}

/** Validación asíncrona del dominio: la usan el alta y la edición. */
export async function requireVehicleWrite(): Promise<void> {
  const [canCreate, canUpdate] = await Promise.all([
    checkPermissionServer('equipos', 'vehicles', 'create'),
    checkPermissionServer('equipos', 'detalle-equipo', 'update'),
  ]);
  if (!canCreate && !canUpdate) throw new Error(FORBIDDEN_MESSAGE);
}

/**
 * Catálogos de las fichas (marcas, tipos, titulares, sectores...): los comparten vehículos y otros
 * equipos, así que alcanza con poder ver el módulo de equipos o alguna de sus dos fichas.
 */
export async function requireEquipmentCatalogAccess(): Promise<void> {
  const [list, vehicleDetail, otherDetail] = await Promise.all([
    canViewServer('equipos', 'equipos'),
    canViewServer('equipos', 'detalle-equipo'),
    canViewServer('equipos', 'detalle-otro-equipo'),
  ]);
  if (!list && !vehicleDetail && !otherDetail) throw new Error(FORBIDDEN_MESSAGE);
}
