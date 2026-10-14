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
import { employeeDocumentSpec, loadEmployeeDocumentRows } from '../lib/employee-document-rows.server';

const logger = new Logger('DocumentosEmpleadosPermanentes/actions.server');

/** Id de la columna "Documento": en permanentes es `document_type` (en mensuales, `documentType`). */
const SPEC = employeeDocumentSpec('document_type');

/**
 * Filas de la lista, calculadas por el motor de cumplimiento: por empleado activo y tipo de documento
 * permanente que le aplica, el documento vigente o una fila faltante. Sin `employeeId` es la lista
 * general; con `employeeId`, la lista embebida en la ficha del empleado (incluye "ya no aplica").
 * Exige el permiso `view` de la subtab.
 */
async function loadRows(employeeId?: string) {
  const { companyId, canViewPrivate } = await assertDocumentListAccess('docs-empleados-permanentes');
  return loadEmployeeDocumentRows(companyId, false, canViewPrivate, employeeId ?? '');
}

export async function getEmployeePermanentDocumentsPaginated(searchParams: DataTableSearchParams, employeeId?: string) {
  try {
    const state = parseListState(searchParams);
    const filtered = applyTableState(await loadRows(employeeId), state, SPEC);
    return { data: paginate(filtered, state), total: filtered.length };
  } catch (error) {
    logger.error('Error al obtener documentos permanentes de empleados paginados', { data: { error } });
    throw new Error('Error al obtener los documentos permanentes de empleados');
  }
}

export type EmployeePermanentDocumentListItem = Awaited<
  ReturnType<typeof getEmployeePermanentDocumentsPaginated>
>['data'][number];

/** Export sin paginar y con tope de filas: el resultado trae el mensaje si se pasa o falla (`ExportResult`). */
export async function getAllEmployeePermanentDocumentsForExport(
  searchParams: DataTableSearchParams,
  employeeId?: string
) {
  try {
    const state = parseListState(searchParams);
    return toExportResult(applyTableState(await loadRows(employeeId), state, SPEC));
  } catch (error) {
    return toExportFailure(error, logger, 'los documentos permanentes de empleados');
  }
}

/** Opciones y counts de UN filtro facetado (lazy-load), con cross-filtering. */
export async function getEmployeePermanentDocumentsSingleFacet(
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
