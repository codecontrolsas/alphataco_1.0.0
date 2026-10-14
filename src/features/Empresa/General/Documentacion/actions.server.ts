'use server';

import {
  COMPANY_DOCUMENT_SPEC,
  loadCompanyDocumentRows,
} from '@/features/Documentacion/DocumentosEmpresa/lib/company-document-rows.server';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
// Resultado discriminado de export: Next enmascara el mensaje de un error lanzado desde una server action.
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { applyTableState, facetCounts, paginate, type InMemoryTableSpec } from '@/shared/lib/in-memory-table';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('Empresa/Documentacion/actions.server');

// ============================================================================
// ROWS
// ============================================================================

type CompanyDocRow = Awaited<ReturnType<typeof loadCompanyDocumentRows>>[number];

/**
 * Esta pestaña muestra permanentes y mensuales juntos. El filtro "Tipo" (`docType`) filtra por el
 * mismo id de tipo de documento que "Documento", y deja ver cuáles son mensuales.
 */
const SPEC: InMemoryTableSpec<CompanyDocRow> = {
  ...COMPANY_DOCUMENT_SPEC,
  facets: {
    ...COMPANY_DOCUMENT_SPEC.facets,
    // Mismo id que "Documento"; la etiqueta indica si es mensual o permanente (los mensuales primero).
    docType: (row) => [
      {
        id: row.id_document_types,
        name: `${row.document_types.is_it_montlhy === true ? 'Mensual' : 'Permanente'}: ${row.document_types.name}`,
      },
    ],
  },
};

/**
 * Filas calculadas por el motor de cumplimiento: por cada tipo de documento de empresa (permanente o
 * mensual) que se le exige a la empresa, el documento vigente o una fila faltante. Solo existe una
 * fila real si hay archivo; subirlo la crea.
 */
async function loadRows(): Promise<CompanyDocRow[]> {
  const [companyId, canView, canViewPrivate] = await Promise.all([
    getActiveCompanyId(),
    // La pantalla vive en Configuración > General > Documentación: es el permiso que la muestra.
    checkPermissionServer('configuracion', 'documentacion', 'view'),
    checkPermissionServer('documentacion', 'documentos-de-empresa', 'view_private'),
  ]);
  if (!canView) throw new Error('No tenés permiso para ver los documentos de la empresa.');
  const [permanent, monthly] = await Promise.all([
    loadCompanyDocumentRows(companyId, false, canViewPrivate),
    loadCompanyDocumentRows(companyId, true, canViewPrivate),
  ]);
  return [...permanent, ...monthly];
}

/** Quita los parámetros de navegación (pestañas) que comparten la URL con la tabla. */
function tableState(searchParams: DataTableSearchParams) {
  const state = parseSearchParams(searchParams);
  delete state.filters['tab'];
  delete state.filters['subtab'];
  return state;
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

/** `parseSearchParams` ya acota `pageSize` a [1, 200] (valor no numérico → 10). */
export async function getCompanyDocsPaginated(searchParams: DataTableSearchParams) {
  try {
    const state = tableState(searchParams);
    const filtered = applyTableState(await loadRows(), state, SPEC);
    return { data: paginate(filtered, state), total: filtered.length };
  } catch (error) {
    logger.error('Error al obtener documentos de empresa paginados', { data: { error } });
    throw new Error('No se pudo obtener la lista de documentos. Intente nuevamente.');
  }
}

export type CompanyDocListItem = Awaited<ReturnType<typeof getCompanyDocsPaginated>>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación, con tope)
// ============================================================================

/** Tope de filas de la exportación (la lista se calcula en memoria). */
const EXPORT_MAX_ROWS = 10_000;

export async function getAllCompanyDocsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<CompanyDocListItem[]>> {
  try {
    const filtered = applyTableState(await loadRows(), tableState(searchParams), SPEC);
    if (filtered.length > EXPORT_MAX_ROWS) {
      return {
        ok: false,
        message: `Hay más de ${EXPORT_MAX_ROWS.toLocaleString('es-AR')} documentos con los filtros actuales. Acote la exportación con filtros.`,
      };
    }
    return { ok: true, data: filtered };
  } catch (error) {
    logger.error('Error al exportar documentos de empresa', { data: { error } });
    return { ok: false, message: 'No se pudo exportar la lista de documentos. Intente nuevamente.' };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load individual, con cross-filtering)
// ============================================================================

/**
 * Opciones y counts de UN SOLO filtro facetado (se llama al abrir el filtro). Los counts excluyen
 * el filtro de la propia columna. Ante un error devuelve counts vacíos.
 */
export async function getCompanyDocsSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: { id: string; name: string }[] }> {
  const empty = { counts: new Map<string, number>() };
  try {
    const result = facetCounts(await loadRows(), tableState(searchParams ?? {}), SPEC, columnId);
    if (!result) {
      logger.warn('getCompanyDocsSingleFacet: columnId no reconocido', { data: { columnId } });
      return empty;
    }
    return result.options.length > 0
      ? { counts: result.counts, resolvedOptions: result.options }
      : { counts: result.counts };
  } catch (error) {
    logger.error('Error al obtener facet de documentos de empresa', { data: { error, columnId } });
    return empty;
  }
}
