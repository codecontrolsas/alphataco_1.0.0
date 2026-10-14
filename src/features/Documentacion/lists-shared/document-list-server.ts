import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import type { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams, DataTableState } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { facetCounts, type InMemoryTableSpec } from '@/shared/lib/in-memory-table';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { countRowStates } from '../shared/lib/state-counts';
import { MAX_EXPORT_ROWS, type DocumentListFacet, type DocumentListTab } from './document-list-types';

/**
 * Piezas server-side comunes a las 4 listas de documentos (empleados/equipos × permanentes/mensuales).
 * Las listas no usan `where` de Prisma: calculan las filas en memoria con el motor de cumplimiento, así
 * que acá sólo viven el permiso, el acotado de la paginación, el tope del export y la faceta.
 */

/** Tab padre de cada subtab: ahí vive el permiso `view_private` (tipos de documento privados). */
const PARENT_TAB: Record<DocumentListTab, 'documentos-de-empleados' | 'documentos-de-equipos'> = {
  'docs-empleados-permanentes': 'documentos-de-empleados',
  'docs-empleados-mensuales': 'documentos-de-empleados',
  'docs-equipos-permanentes': 'documentos-de-equipos',
  'docs-equipos-mensuales': 'documentos-de-equipos',
};

/** Sin permiso `view`. Se distingue para que el export lo devuelva como mensaje en vez de lanzarlo. */
export class DocumentListAccessError extends Error {
  constructor() {
    super('No tenés permiso para ver estos documentos.');
    this.name = 'DocumentListAccessError';
  }
}

/**
 * Exige en el servidor el permiso `documentacion:<subtab>:view` (el mismo que oculta la subtab en la UI
 * y en las fichas de empleado/equipo) y resuelve la empresa activa y el acceso a tipos privados.
 */
export async function assertDocumentListAccess(tab: DocumentListTab) {
  const [companyId, canView, canViewPrivate] = await Promise.all([
    getActiveCompanyId(),
    checkPermissionServer('documentacion', tab, 'view'),
    checkPermissionServer('documentacion', PARENT_TAB[tab], 'view_private'),
  ]);
  if (!canView) throw new DocumentListAccessError();
  return { companyId, canViewPrivate };
}

/**
 * Estado de la tabla a partir de la URL con la paginación acotada: `pageSize` 1..200 y `page` dentro de
 * un rango razonable, aunque la URL traiga valores enormes, negativos o `NaN`.
 */
export function parseListState(searchParams: DataTableSearchParams): DataTableState {
  const state = parseSearchParams(searchParams);
  const pageSize =
    Number.isFinite(state.pageSize) && state.pageSize >= 1 ? Math.min(Math.floor(state.pageSize), 200) : 10;
  const page = Number.isFinite(state.page) && state.page >= 0 ? Math.min(Math.floor(state.page), 100_000) : 0;
  return { ...state, page, pageSize };
}

/** Filas del export: con tope, y con el mensaje en el resultado (Next enmascara el de un error lanzado). */
export function toExportResult<Row>(rows: Row[]): ExportResult<Row[]> {
  if (rows.length > MAX_EXPORT_ROWS) {
    return {
      ok: false,
      message: `La exportación tiene ${rows.length.toLocaleString('es-AR')} filas y el máximo es ${MAX_EXPORT_ROWS.toLocaleString('es-AR')}. Aplicá filtros para acotarla.`,
    };
  }
  return { ok: true, data: rows };
}

/** Falla de un export: el permiso se informa tal cual; el resto se loguea y se devuelve un mensaje genérico. */
export function toExportFailure(error: unknown, logger: Logger, label: string): ExportResult<never> {
  if (error instanceof DocumentListAccessError) return { ok: false, message: error.message };
  logger.error(`Error al exportar ${label}`, { data: { error } });
  return { ok: false, message: `Error al exportar ${label}` };
}

/**
 * Faceta de UNA columna con cross-filter. Una columna desconocida o un error devuelven conteos vacíos
 * (con log), así el filtro se muestra vacío en vez de romper el popover.
 */
export function listFacet<Row>(
  rows: readonly Row[],
  searchParams: DataTableSearchParams | undefined,
  spec: InMemoryTableSpec<Row>,
  columnId: string,
  logger: Logger
): DocumentListFacet {
  const result = facetCounts(rows, parseListState(searchParams ?? {}), spec, columnId);
  if (!result) {
    logger.warn('Faceta de columna no reconocida', { data: { columnId } });
    return { counts: new Map() };
  }
  return result.options.length > 0
    ? { counts: result.counts, resolvedOptions: result.options }
    : { counts: result.counts };
}

/** Falla al calcular una faceta: se loguea y el filtro queda sin opciones. */
export function emptyFacetOnError(error: unknown, logger: Logger, columnId: string): DocumentListFacet {
  logger.error('Error al obtener la faceta de la lista de documentos', { data: { error, columnId } });
  return { counts: new Map() };
}

/** Conteos por estado de las tarjetas, con el mismo permiso y las mismas filas que la tabla. */
export async function stateCountsOf<Row extends { state: string | null; notApplicable?: boolean }>(
  tab: DocumentListTab,
  loadRows: (access: { companyId: string; canViewPrivate: boolean }) => Promise<readonly Row[]>
) {
  return countRowStates(await loadRows(await assertDocumentListAccess(tab)));
}
