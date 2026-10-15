'use server';

import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { getOrdersPaginatedCached, getOrdersSingleFacetCached, type FacetPayload } from './lib/order-queries';
import { resolveOrdersScope as resolveScope } from './lib/order-scope';
import { loadTasksForExport, type MaintenanceOrderTaskExportRow } from './lib/tasks-export';

/**
 * Listado "En Taller". Cada acción exige `view` de `mantenimiento/ordenes_mantenimiento` y resuelve la
 * empresa en el servidor (ver `lib/order-scope`); la empresa y los tipos ocultos entran en la clave del
 * cache de las consultas.
 */

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
