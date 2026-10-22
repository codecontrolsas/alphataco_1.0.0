'use server';

import { canViewDashboard } from '@/features/Dashboard/lib/permissions.server';
import { employeeDocumentSpec } from '@/features/Documentacion/DocumentosEmpleados/lib/employee-document-rows.server';
import { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { exportRowLimitMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { applyTableState, facetCounts, paginate } from '@/shared/lib/in-memory-table';
import type { EmployeeExpiringDocListItem } from '../lib/expiring-docs-types';
import { loadEmployeeExpiringRows } from '../lib/expiring-rows.server';

/** Tope de filas por export: más que esto se pide acotar con filtros. */
const EXPORT_MAX_ROWS = 10_000;

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
// PAGINATED QUERY
// ============================================================================

export async function getEmployeeExpiringDocsPaginated(searchParams: DataTableSearchParams) {
  logger.debug('Obteniendo documentos de empleados por vencer');

  try {
    const state = parseSearchParams(searchParams);
    const filtered = applyTableState(await loadEmployeeExpiringRows(), state, SPEC);
    return { data: paginate(filtered, state), total: filtered.length };
  } catch (error) {
    logger.error('Error al obtener documentos de empleados por vencer', { data: { error } });
    throw new Error('No se pudieron obtener los documentos. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT QUERY (sin paginación)
// ============================================================================

export async function getAllEmployeeExpiringDocsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<EmployeeExpiringDocListItem[]>> {
  logger.debug('Exportando documentos de empleados por vencer');

  if (!(await canViewDashboard('empleados')))
    return { ok: false, message: 'No tenés permiso para exportar esta lista' };

  try {
    const state = parseSearchParams(searchParams);
    const rows = applyTableState(await loadEmployeeExpiringRows(), state, SPEC);
    if (rows.length > EXPORT_MAX_ROWS) {
      return {
        ok: false,
        message: exportRowLimitMessage(EXPORT_MAX_ROWS),
      };
    }
    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar documentos de empleados por vencer', { data: { error } });
    return { ok: false, message: 'No se pudo exportar la lista. Intente nuevamente.' };
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
    const result = facetCounts(await loadEmployeeExpiringRows(), parseSearchParams(searchParams ?? {}), SPEC, columnId);
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
