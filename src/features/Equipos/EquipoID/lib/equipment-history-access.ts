import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from './table-filters';

/**
 * Perímetro de las consultas de la ficha del equipo (historial de mantenimiento, solicitudes rechazadas
 * y checklists). Módulo server-only (NO es una Server Action).
 *
 * Los slugs son los mismos que usa `vehicle-tabs.tsx` para mostrar cada tab y los que declara
 * `permissions-map.ts` (módulo `equipos`, acción `view`).
 */
export const EQUIPMENT_HISTORY_TAB = 'historial-mantenimiento-equipo';
export const EQUIPMENT_CHECKLIST_TAB = 'checklist-equipo';

/** Falta de permiso o id inválido: el mensaje es apto para mostrárselo al usuario. */
export class EquipmentHistoryAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EquipmentHistoryAccessError';
  }
}

/**
 * Exige el permiso `view` de la tab de la ficha y devuelve la empresa activa. Toda consulta posterior se
 * acota por esa empresa (`company_id`) y por el equipo, así que un id ajeno devuelve vacío, no datos.
 */
export async function requireEquipmentTabView(
  tabSlug: typeof EQUIPMENT_HISTORY_TAB | typeof EQUIPMENT_CHECKLIST_TAB,
  equipmentId: string
): Promise<string> {
  if (!isUuid(equipmentId)) throw new EquipmentHistoryAccessError('Equipo inválido');

  const companyId = await getActiveCompanyId();
  const allowed = await checkPermissionServer('equipos', tabSlug, 'view');
  if (!allowed) throw new EquipmentHistoryAccessError('No tiene permiso para ver esta información del equipo');

  return companyId;
}
