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
  attachEquipmentDocumentLogs,
  equipmentDocumentSpec,
  loadEquipmentDocumentRows,
} from '../lib/equipment-document-rows.server';

const logger = new Logger('MonthlyEquipmentDocs/actions.server');

/** En mensuales la columna "Documento" es `documentType` (en permanentes, `document_type`). */
const SPEC = equipmentDocumentSpec('documentType');

/**
 * Filas de la lista, calculadas por el motor de cumplimiento: por equipo activo y tipo mensual que
 * le aplica, el documento del período corriente o una fila faltante, más el historial de otros
 * períodos. Con `equipmentId` es la lista embebida en la ficha del equipo (incluye "ya no aplica").
 * Exige el permiso `view` de la subtab.
 */
async function loadRows(equipmentId?: string) {
  const { companyId, canViewPrivate } = await assertDocumentListAccess('docs-equipos-mensuales');
  return loadEquipmentDocumentRows(companyId, true, canViewPrivate, equipmentId ?? '');
}

export async function getMonthlyEquipmentDocumentsPaginated(searchParams: DataTableSearchParams, equipmentId?: string) {
  try {
    const state = parseListState(searchParams);
    const filtered = applyTableState(await loadRows(equipmentId), state, SPEC);
    const data = await attachEquipmentDocumentLogs(paginate(filtered, state));
    return { data, total: filtered.length };
  } catch (error) {
    logger.error('Error al obtener documentos mensuales de equipos paginados', { data: { error } });
    throw new Error('Error al obtener los documentos mensuales de equipos');
  }
}

export type MonthlyEquipmentDocumentListItem = Awaited<
  ReturnType<typeof getMonthlyEquipmentDocumentsPaginated>
>['data'][number];

/** Export sin paginar y con tope de filas: el resultado trae el mensaje si se pasa o falla (`ExportResult`). */
export async function getAllMonthlyEquipmentDocumentsForExport(
  searchParams: DataTableSearchParams,
  equipmentId?: string
) {
  try {
    const state = parseListState(searchParams);
    return toExportResult(applyTableState(await loadRows(equipmentId), state, SPEC));
  } catch (error) {
    return toExportFailure(error, logger, 'los documentos mensuales de equipos');
  }
}

/** Opciones y counts de UN filtro facetado (lazy-load), con cross-filtering. */
export async function getMonthlyEquipmentDocumentsSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams,
  equipmentId?: string
): Promise<DocumentListFacet> {
  try {
    return listFacet(await loadRows(equipmentId), searchParams, SPEC, columnId, logger);
  } catch (error) {
    return emptyFacetOnError(error, logger, columnId);
  }
}
