'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { getHiddenEquipmentTypeIds } from '../../utils/equipmentTypeVisibility';
import { getOrdersPaginatedCached, getOrdersSingleFacetCached, type FacetPayload } from './lib/order-queries';
import { loadTasksForExport, type MaintenanceOrderTaskExportRow } from './lib/tasks-export';

/**
 * Listado "En Taller". Cada acción exige `view` de `mantenimiento/ordenes_mantenimiento` (la misma tab que
 * muestra la UI) y resuelve la empresa en el servidor; la empresa y los tipos ocultos entran en la clave
 * del cache de las consultas.
 */
const MODULE = 'mantenimiento';
const TAB = 'ordenes_mantenimiento';

async function resolveScope() {
  if (!(await checkPermissionServer(MODULE, TAB, 'view'))) return null;
  const [companyId, hiddenTypeIds] = await Promise.all([getActiveCompanyId(), getHiddenEquipmentTypeIds()]);
  return { companyId, hiddenTypeIds };
}

export async function getMaintenanceOrdersPaginated(searchParams: DataTableSearchParams) {
  const scope = await resolveScope();
  if (!scope) throw new Error('No tenés permiso para ver las órdenes de mantenimiento');
  return getOrdersPaginatedCached(scope.companyId, scope.hiddenTypeIds, searchParams);
}

export type MaintenanceOrderListItem = Awaited<ReturnType<typeof getMaintenanceOrdersPaginated>>['data'][number];

export async function getMaintenanceOrdersSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetPayload | null> {
  const scope = await resolveScope();
  if (!scope) return { counts: new Map<string, number>() };
  return getOrdersSingleFacetCached(scope.companyId, scope.hiddenTypeIds, columnId, searchParams ?? {});
}

/** Excel a nivel de tarea (ticket 682). Devuelve `ExportResult` (tope 10.000) para no enmascarar el mensaje. */
export async function getMaintenanceOrderTasksForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<MaintenanceOrderTaskExportRow[]>> {
  const scope = await resolveScope();
  if (!scope) return { ok: false, message: 'No tenés permiso para exportar las órdenes de mantenimiento' };
  return loadTasksForExport(scope.companyId, scope.hiddenTypeIds, searchParams);
}
