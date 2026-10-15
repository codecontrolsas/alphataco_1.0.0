'use server';

import { Logger } from '@/lib/logger';
import { NULL_FILTER_VALUE, stateToPrismaParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { CATALOG_EXPORT_MAX_ROWS, catalogExportFailure, catalogTooLargeMessage } from '../../lib/catalog-table.server';
import { configPermissionError, requireConfigTabPermission } from '../../lib/config-access.server';
import {
  EXTERNAL_API_CLIENT_SELECT,
  buildWhereClause,
  parseClientsState,
  resolveSafeOrderBy,
} from './lib/clients-where';

const logger = new Logger('AccesosExternos/list/actions.server');

/**
 * Listado paginado de accesos externos (ticket 671).
 *
 * REGLA DE SEGURIDAD DURA: `secret_hash` NUNCA debe aparecer en ningun `select`
 * de este archivo ni de `lib/clients-where.ts`. Solo `secret_prefix`.
 */

function toFacetMap(rows: { key: string | null | undefined; count: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const { key, count } of rows) {
    map.set(key == null ? NULL_FILTER_VALUE : String(key), count);
  }
  return map;
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getExternalApiClientsPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('accesos-externos', 'view');
  const companyId = await getActiveCompanyId();

  try {
    const state = parseClientsState(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    const [data, total] = await Promise.all([
      prisma.external_api_clients.findMany({
        skip,
        take,
        orderBy: resolveSafeOrderBy(state),
        where,
        select: EXTERNAL_API_CLIENT_SELECT,
      }),
      prisma.external_api_clients.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener accesos externos paginados', { data: { error } });
    throw new Error('No se pudo obtener el listado de accesos externos');
  }
}

// ============================================================================
// EXPORT QUERY (sin paginacion, con tope)
// ============================================================================

export async function getAllExternalApiClientsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<Awaited<ReturnType<typeof getExternalApiClientsPaginated>>['data']>> {
  const denied = await configPermissionError('accesos-externos', 'view');
  if (denied) return { ok: false, message: denied };

  try {
    const companyId = await getActiveCompanyId();
    const state = parseClientsState(searchParams);
    const where = buildWhereClause(companyId, state);
    const orderBy = [...resolveSafeOrderBy(state), { id: 'asc' as const }];

    const rows = await fetchExportRowsInBatches({
      maxRows: CATALOG_EXPORT_MAX_ROWS,
      listIds: (take) => prisma.external_api_clients.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.external_api_clients.findMany({
          where: { AND: [where, { id: { in: ids } }] },
          select: EXTERNAL_API_CLIENT_SELECT,
        }),
      tooLargeMessage: catalogTooLargeMessage('accesos externos'),
    });
    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar accesos externos', { data: { error } });
    return catalogExportFailure(error, 'el listado de accesos externos');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load — un filtro a la vez, con cross-filtering)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering
 * (todos los filtros activos menos el de la propia columna).
 */
export async function getExternalApiClientsSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  await requireConfigTabPermission('accesos-externos', 'view');
  const companyId = await getActiveCompanyId();

  try {
    const state = parseClientsState(searchParams);
    const crossState = { ...state, filters: { ...state.filters } };
    delete crossState.filters[columnId];
    delete crossState.filters[`${columnId}_from`];
    delete crossState.filters[`${columnId}_to`];
    const where = buildWhereClause(companyId, crossState);

    // ── Estado (derivado de revoked_at) ──────────────────────────────────────
    if (columnId === 'status') {
      const [activeCount, revokedCount] = await Promise.all([
        prisma.external_api_clients.count({ where: { AND: [where, { revoked_at: null }] } }),
        prisma.external_api_clients.count({ where: { AND: [where, { revoked_at: { not: null } }] } }),
      ]);
      const counts = new Map<string, number>();
      if (activeCount > 0) counts.set('active', activeCount);
      if (revokedCount > 0) counts.set('revoked', revokedCount);
      return { counts };
    }

    // ── Creado por (FK nullable a profile) ───────────────────────────────────
    if (columnId === 'creator') {
      const rows = await prisma.external_api_clients.groupBy({ by: ['created_by'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.created_by, count: r._count })));
      const ids = rows.map((r) => r.created_by).filter((id): id is string => Boolean(id));
      const resolvedOptions =
        ids.length > 0
          ? (await prisma.profile.findMany({ where: { id: { in: ids } }, select: { id: true, fullname: true } })).map(
              (p) => ({ id: p.id, name: p.fullname })
            )
          : [];
      return { counts, resolvedOptions };
    }

    logger.warn('getExternalApiClientsSingleFacet: columnId no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual de accesos externos', { data: { error, columnId } });
    return null;
  }
}
