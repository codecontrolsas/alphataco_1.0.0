'use server';

import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { requireConfigTabPermission } from '../../lib/config-access.server';

const logger = new Logger('AccesosExternos/list/actions.server');

/**
 * Listado paginado de accesos externos (ticket 671).
 *
 * REGLA DE SEGURIDAD DURA: `secret_hash` NUNCA debe aparecer en ningun `select`
 * de este archivo, ni en columnas ni en export. Solo `secret_prefix`.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos ordenables server-side. `status` y `creator` se resuelven via mapeo */
const VALID_SORT_FIELDS = new Set(['name', 'client_id', 'status', 'last_used_at', 'created_at', 'creator', 'notes']);

/** columnId → campo real de Prisma, para columnas directas cuyo nombre difiere */
const SORT_FIELD_MAP: Record<string, string> = {
  status: 'revoked_at',
};

/** columnId → orderBy de Prisma con relacion, para columnas FK */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  creator: (dir) => ({ creator: { fullname: dir } }),
};

/** Columnas con filtro de texto libre (contains insensitive) */
const TEXT_FILTER_COLUMNS = ['name', 'client_id', 'notes'];

/** Columnas con filtro de rango de fechas */
const DATE_RANGE_COLUMNS = ['last_used_at', 'created_at'];

/**
 * Mapping de columnId (URL) → campo real en Prisma.
 * `status` NO tiene entrada aca: es una columna derivada de `revoked_at` y se
 * maneja completamente a mano (ver MANUALLY_HANDLED en buildWhereClause).
 */
const COLUMN_MAP: Record<string, string> = {
  creator: 'created_by',
};

/**
 * Select comun — NUNCA agregar `secret_hash` aqui.
 * `secret_prefix` no se pide en esta tabla (no hay columna que lo muestre);
 * si se necesita en el futuro, agregarlo aca junto con su columna.
 */
const EXTERNAL_API_CLIENT_SELECT = {
  id: true,
  name: true,
  client_id: true,
  revoked_at: true,
  last_used_at: true,
  notes: true,
  created_at: true,
  creator: { select: { id: true, fullname: true } },
} as const;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>) {
  const searchWhere = buildSearchWhere(state.search, ['name', 'client_id']);

  // `status` es derivado de `revoked_at` — se maneja a mano, nunca via buildFiltersWhere
  const MANUALLY_HANDLED = ['status'];

  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [
      ...TEXT_FILTER_COLUMNS,
      ...MANUALLY_HANDLED,
      ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`]),
    ],
  });

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS);
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  // Filtro "Estado" (activo/revocado) — traducido a revoked_at null / not null.
  // Si el usuario selecciona ambas opciones (o ninguna) no se filtra: coincide con todos.
  const statusFilters: Record<string, unknown> = {};
  const statusValues = state.filters['status'];
  if (statusValues?.length === 1) {
    statusFilters.revoked_at = statusValues[0] === 'active' ? null : { not: null };
  }

  return {
    company_id: companyId,
    ...searchWhere,
    ...filtersWhere,
    ...textFiltersWhere,
    ...dateFiltersWhere,
    ...statusFilters,
  };
}

function resolveSafeOrderBy(state: ReturnType<typeof parseSearchParams>) {
  const resolvedSorts: Record<string, unknown>[] = [];
  for (const s of state.sorting) {
    if (!VALID_SORT_FIELDS.has(s.id)) continue;
    const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
    const fkMapper = FK_SORT_MAP[s.id];
    if (fkMapper) {
      resolvedSorts.push(fkMapper(dir));
      continue;
    }
    const field = SORT_FIELD_MAP[s.id] ?? s.id;
    resolvedSorts.push({ [field]: dir });
  }
  // Los accesos revocados (is_active: false) siempre quedan al final,
  // independientemente del orden que elija el usuario.
  return [{ is_active: 'desc' as const }, ...resolvedSorts, { created_at: 'desc' as const }];
}

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
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);
    const safeOrderBy = resolveSafeOrderBy(state);

    const [data, total] = await Promise.all([
      prisma.external_api_clients.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
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

export type ExternalApiClientListItem = Awaited<ReturnType<typeof getExternalApiClientsPaginated>>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginacion)
// ============================================================================

export async function getAllExternalApiClientsForExport(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('accesos-externos', 'view');
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);
    const safeOrderBy = resolveSafeOrderBy(state);

    return await prisma.external_api_clients.findMany({
      where,
      orderBy: safeOrderBy,
      select: EXTERNAL_API_CLIENT_SELECT,
    });
  } catch (error) {
    logger.error('Error al exportar accesos externos', { data: { error } });
    throw new Error('No se pudo exportar el listado de accesos externos');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load — un filtro a la vez, con cross-filtering)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Cada filtro del cliente llama a esta funcion al abrirse (lazy-load).
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
  const baseWhere = { company_id: companyId };

  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  function crossWhere(excludeColumn: string) {
    if (!parsedState || !hasActiveFilters) return baseWhere;
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[excludeColumn];
    delete modified.filters[`${excludeColumn}_from`];
    delete modified.filters[`${excludeColumn}_to`];
    return buildWhereClause(companyId, modified);
  }

  try {
    const where = crossWhere(columnId);

    // ── Estado (derivado de revoked_at) ──────────────────────────────────────
    if (columnId === 'status') {
      const [activeCount, revokedCount] = await Promise.all([
        prisma.external_api_clients.count({ where: { ...where, revoked_at: null } }),
        prisma.external_api_clients.count({ where: { ...where, revoked_at: { not: null } } }),
      ]);
      const counts = new Map<string, number>();
      if (activeCount > 0) counts.set('active', activeCount);
      if (revokedCount > 0) counts.set('revoked', revokedCount);
      return { counts };
    }

    // ── Creado por (FK nullable a profile) ───────────────────────────────────
    if (columnId === 'creator') {
      const rows = await prisma.external_api_clients.groupBy({
        by: ['created_by'],
        where,
        _count: true,
      });
      const counts = toFacetMap(rows.map((r) => ({ key: r.created_by, count: r._count })));
      const ids = rows.map((r) => r.created_by).filter(Boolean) as string[];
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
