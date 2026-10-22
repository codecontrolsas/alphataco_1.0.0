'use server';

import { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { applyTableState, facetCounts, paginate } from '@/shared/lib/in-memory-table';
// Resultado discriminado de export: Next enmascara el mensaje de un error lanzado desde una server action.
import { tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { COMPANY_DOCUMENT_SPEC, loadAuthorizedCompanyDocumentRows } from './lib/company-document-rows.server';

const logger = new Logger('Documentacion/DocumentosEmpresa/actions.server');

/** Tope de filas de la exportación (la lista se calcula en memoria: se acota para no armar un Excel enorme). */
const EXPORT_MAX_ROWS = 10_000;

/**
 * Filas de la lista, calculadas por el motor de cumplimiento: por tipo de documento de empresa
 * (permanente o mensual) que se le exige a la empresa, el documento vigente o una fila faltante.
 * `parseSearchParams` ya acota `pageSize` a [1, 200] (valor no numérico → 10).
 */
export async function getCompanyDocsPaginated(searchParams: DataTableSearchParams, isMonthly: boolean) {
  try {
    const state = parseSearchParams(searchParams);
    const filtered = applyTableState(await loadAuthorizedCompanyDocumentRows(isMonthly), state, COMPANY_DOCUMENT_SPEC);
    return { data: paginate(filtered, state), total: filtered.length };
  } catch (error) {
    logger.error('Error al obtener documentos de empresa paginados', { data: { error, isMonthly } });
    throw new Error('No se pudo obtener la lista de documentos. Intente nuevamente.');
  }
}

export type CompanyDocListItem = Awaited<ReturnType<typeof getCompanyDocsPaginated>>['data'][number];

/** Todas las filas con los filtros actuales (sin paginar), con tope de `EXPORT_MAX_ROWS`. */
export async function getAllCompanyDocsForExport(
  searchParams: DataTableSearchParams,
  isMonthly: boolean
): Promise<ExportResult<CompanyDocListItem[]>> {
  try {
    const state = parseSearchParams(searchParams);
    const filtered = applyTableState(await loadAuthorizedCompanyDocumentRows(isMonthly), state, COMPANY_DOCUMENT_SPEC);
    if (filtered.length > EXPORT_MAX_ROWS) {
      return {
        ok: false,
        message: tooManyRowsMessage('documentos')(EXPORT_MAX_ROWS),
      };
    }
    return { ok: true, data: filtered };
  } catch (error) {
    logger.error('Error al exportar documentos de empresa', { data: { error, isMonthly } });
    return { ok: false, message: 'No se pudo exportar la lista de documentos. Intente nuevamente.' };
  }
}

export interface CompanyDocsSingleFacet {
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
}

/**
 * Opciones y counts de UN SOLO filtro facetado (lazy-load al abrir el popover), con cross-filter:
 * los counts excluyen el filtro de la propia columna. Ante un error devuelve counts vacíos.
 */
export async function getCompanyDocsSingleFacet(
  columnId: string,
  isMonthly: boolean,
  searchParams?: DataTableSearchParams
): Promise<CompanyDocsSingleFacet> {
  try {
    const result = facetCounts(
      await loadAuthorizedCompanyDocumentRows(isMonthly),
      parseSearchParams(searchParams ?? {}),
      COMPANY_DOCUMENT_SPEC,
      columnId
    );
    if (!result) {
      logger.warn('getCompanyDocsSingleFacet: columnId no reconocido', { data: { columnId } });
      return { counts: new Map() };
    }
    return result.options.length > 0
      ? { counts: result.counts, resolvedOptions: result.options }
      : { counts: result.counts };
  } catch (error) {
    logger.error('Error al obtener facet de documentos de empresa', { data: { error, columnId, isMonthly } });
    return { counts: new Map() };
  }
}
