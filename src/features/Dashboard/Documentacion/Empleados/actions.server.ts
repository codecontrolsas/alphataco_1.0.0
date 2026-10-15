'use server';

import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import {
  employeeDocumentSpec,
  loadEmployeeDocumentRows,
} from '@/features/Documentacion/DocumentosEmpleados/lib/employee-document-rows.server';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { applyTableState, facetCounts, paginate } from '@/shared/lib/in-memory-table';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { selectExpiringRows } from '../lib/expiring-documents.server';

const logger = new Logger('features/Dashboard/Documentacion/Empleados');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Id de la columna "Tipo de Documento" de esta tabla. */
const TYPE_COLUMN_ID = 'document_type';

/** Misma búsqueda/filtros/facetas que la lista de permanentes; sin orden elegido, el más urgente primero. */
const BASE_SPEC = employeeDocumentSpec(TYPE_COLUMN_ID);
const SPEC: typeof BASE_SPEC = {
  ...BASE_SPEC,
  defaultSort: [(row) => row.validity, ...(BASE_SPEC.defaultSort ?? [])],
};

// ============================================================================
// ROWS
// ============================================================================

/**
 * Documentos de empleados activos que ya vencieron o vencen en los próximos 30 días: las filas del
 * motor de cumplimiento (estado derivado en hora argentina), sin faltantes ni "ya no aplica".
 */
async function loadRows() {
  await requireDashboardView('empleados');
  const [companyId, canViewPrivate] = await Promise.all([
    getActiveCompanyId(),
    checkPermissionServer('documentacion', 'documentos-de-empleados', 'view_private'),
  ]);
  return selectExpiringRows(await loadEmployeeDocumentRows(companyId, false, canViewPrivate, ''));
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getEmployeeExpiringDocsPaginated(searchParams: DataTableSearchParams) {
  logger.debug('Obteniendo documentos de empleados por vencer');

  try {
    const state = parseSearchParams(searchParams);
    const filtered = applyTableState(await loadRows(), state, SPEC);
    return { data: paginate(filtered, state), total: filtered.length };
  } catch (error) {
    logger.error('Error al obtener documentos de empleados por vencer', { data: { error } });
    throw new Error('No se pudieron obtener los documentos. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT QUERY (sin paginación)
// ============================================================================

export async function getAllEmployeeExpiringDocsForExport(searchParams: DataTableSearchParams) {
  logger.debug('Exportando documentos de empleados por vencer');

  try {
    const state = parseSearchParams(searchParams);
    return applyTableState(await loadRows(), state, SPEC);
  } catch (error) {
    logger.error('Error al exportar documentos de empleados por vencer', { data: { error } });
    throw new Error('No se pudo exportar la lista. Intente nuevamente.');
  }
}

// ============================================================================
// FACETS — Single column (lazy-load)
// ============================================================================

/**
 * Obtiene counts (y opciones resueltas para FK) de UNA sola columna.
 * Implementa cross-filter: aplica todos los filtros activos EXCEPTO la columna propia.
 */
export async function getEmployeeExpiringDocsSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  logger.debug('Obteniendo facet de documentos de empleados por vencer', { data: { columnId } });

  try {
    const result = facetCounts(await loadRows(), parseSearchParams(searchParams ?? {}), SPEC, columnId);
    if (!result) {
      logger.warn('columnId no reconocido en getEmployeeExpiringDocsSingleFacet', { data: { columnId } });
      return null;
    }
    return result.options.length > 0
      ? { counts: result.counts, resolvedOptions: result.options }
      : { counts: result.counts };
  } catch (error) {
    logger.error('Error al obtener facet de documentos de empleados por vencer', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type EmployeeExpiringDocListItem = Awaited<ReturnType<typeof getEmployeeExpiringDocsPaginated>>['data'][number];
