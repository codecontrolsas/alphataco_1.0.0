'use server';

import { Logger } from '@/lib/logger';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { applyTableState, paginate } from '@/shared/lib/in-memory-table';
import {
  assertDocumentListAccess,
  emptyFacetOnError,
  listFacet,
  parseListState,
  toExportFailure,
  toExportResult,
} from '../../lists-shared/document-list-server';
import type { DocumentListFacet } from '../../lists-shared/document-list-types';
import {
  attachEmployeeDocumentLogs,
  employeeDocumentSpec,
  loadEmployeeDocumentRows,
} from '../lib/employee-document-rows.server';

const logger = new Logger('MonthlyEmployeeDocs/actions.server');

/** Id de la columna "Documento": en mensuales es `documentType` (en permanentes, `document_type`). */
const SPEC = employeeDocumentSpec('documentType');

/**
 * Filas de la lista, calculadas por el motor de cumplimiento: por empleado activo y tipo mensual que
 * le aplica, el documento del período corriente o una fila faltante; además, el historial de otros
 * períodos. Con `employeeId` es la lista embebida en la ficha (incluye "ya no aplica").
 * Exige el permiso `view` de la subtab.
 */
async function loadRows(employeeId?: string) {
  const { companyId, canViewPrivate } = await assertDocumentListAccess('docs-empleados-mensuales');
  return loadEmployeeDocumentRows(companyId, true, canViewPrivate, employeeId ?? '');
}

export async function getMonthlyEmployeeDocumentsPaginated(searchParams: DataTableSearchParams, employeeId?: string) {
  try {
    const state = parseListState(searchParams);
    const filtered = applyTableState(await loadRows(employeeId), state, SPEC);
    const data = await attachEmployeeDocumentLogs(paginate(filtered, state));
    return { data, total: filtered.length };
  } catch (error) {
    logger.error('Error al obtener documentos mensuales de empleados paginados', { data: { error } });
    throw new Error('Error al obtener los documentos mensuales de empleados');
  }
}

export type MonthlyEmployeeDocumentListItem = Awaited<
  ReturnType<typeof getMonthlyEmployeeDocumentsPaginated>
>['data'][number];

/** Export sin paginar y con tope de filas: el resultado trae el mensaje si se pasa o falla (`ExportResult`). */
export async function getAllMonthlyEmployeeDocumentsForExport(
  searchParams: DataTableSearchParams,
  employeeId?: string
) {
  try {
    const state = parseListState(searchParams);
    return toExportResult(applyTableState(await loadRows(employeeId), state, SPEC));
  } catch (error) {
    return toExportFailure(error, logger, 'los documentos mensuales de empleados');
  }
}

/** Opciones y counts de UN filtro facetado (lazy-load), con cross-filtering. */
export async function getMonthlyEmployeeDocumentsSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams,
  employeeId?: string
): Promise<DocumentListFacet> {
  try {
    return listFacet(await loadRows(employeeId), searchParams, SPEC, columnId, logger);
  } catch (error) {
    return emptyFacetOnError(error, logger, columnId);
  }
}
