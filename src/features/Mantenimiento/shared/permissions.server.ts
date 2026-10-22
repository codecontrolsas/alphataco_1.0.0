import 'server-only';

import { checkMultiplePermissionsServer } from '@/features/Permissions/actions/permissions.server';

/** Módulo de permisos de Mantenimiento. */
const MAINTENANCE_MODULE = 'mantenimiento';

export type MaintenanceAction = 'view' | 'create' | 'update' | 'delete';

/**
 * Exige `accion` en AL MENOS UNA de las tabs indicadas (cuando una lectura o una escritura se
 * abre desde varias pantallas, alcanza con el permiso de cualquiera de ellas).
 *
 * Sin RLS cada `'use server'` exportado es un endpoint público: el permiso se verifica acá y no
 * en el botón del cliente. Módulo server-only (NO es una Server Action).
 */
export async function requireMaintenancePermission(
  tabs: string | readonly string[],
  action: MaintenanceAction
): Promise<void> {
  const list = typeof tabs === 'string' ? [tabs] : [...tabs];
  const result = await checkMultiplePermissionsServer(
    list.map((tabSlug) => ({ moduleSlug: MAINTENANCE_MODULE, tabSlug, actionSlug: action }))
  );

  const allowed = list.some((tabSlug) => result.get(`${MAINTENANCE_MODULE}:${tabSlug}:${action}`) === true);
  if (!allowed) throw new Error('No tenés permiso para realizar esta acción');
}

/** Versión booleana, para las acciones que devuelven `{ ok:false }` en vez de lanzar. */
export async function hasMaintenancePermission(
  tabs: string | readonly string[],
  action: MaintenanceAction
): Promise<boolean> {
  try {
    await requireMaintenancePermission(tabs, action);
    return true;
  } catch {
    return false;
  }
}

/** Tabs desde las que se abre el detalle de un pedido (lectura). */
export const ORDER_DETAIL_VIEW_TABS = [
  'ordenes_mantenimiento',
  'seguimiento_taller',
  'bandeja_aprobaciones',
  'gestion_ordenes',
  'pedidos_pendientes',
  'pedidos_confirmados',
] as const;
