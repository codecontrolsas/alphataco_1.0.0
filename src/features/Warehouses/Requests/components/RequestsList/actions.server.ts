'use server';

import { checkPermissionServer } from '@/features/Permissions';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
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
import { pickFilters } from '../../../lib/filters';
import { DESTINATION_SELECT, destinationLabel } from '../../../lib/labels';

const logger = new Logger('features/Warehouses/Requests/RequestsList');

type RequestWhere = Prisma.material_requestsWhereInput;
type RequestOrderBy = Prisma.material_requestsOrderByWithRelationInput;
type FilterState = ReturnType<typeof parseSearchParams>;

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Ordenables: numero, estado, tipo de destino y fecha (campos directos) + solicitante y quien
 * decidio (FK). NO ordenables: `destination` (calculado desde varias relaciones) y `progress`
 * (derivado de las entregas, no es un campo de la base).
 */
const VALID_SORT_FIELDS = new Set(['number', 'status', 'destination_type', 'created_at']);

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => RequestOrderBy> = {
  requester: (dir) => ({ requester: { fullname: dir } }),
  decider: (dir) => ({ decider: { fullname: dir } }),
};

const TEXT_FILTER_COLUMNS = ['number'];
const DATE_RANGE_COLUMNS = ['created_at'];

/** Unicas columnas que pasan por `buildFiltersWhere` (lista de permitidas, ver `lib/filters.ts`). */
const FACETED_COLUMNS = ['status', 'requester', 'destination_type', 'decider'] as const;

/** columnId (URL) -> campo Prisma, solo donde difieren. */
const COLUMN_MAP: Record<string, string> = {
  requester: 'requested_by',
  decider: 'decided_by',
};

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

interface Scope {
  companyId: string;
  /** Si no es null, el usuario solo ve sus propios pedidos (sin `view_all_requests`). */
  ownProfileId: string | null;
}

/** Empresa + visibilidad. `null` = sin acceso (sin `view` o sin perfil) -> lista vacia. */
async function resolveScope(): Promise<Scope | null> {
  const [canView, canViewAll] = await Promise.all([
    checkPermissionServer('almacenes', 'pedidos', 'view'),
    checkPermissionServer('almacenes', 'pedidos', 'view_all_requests'),
  ]);
  if (!canView) return null;

  const companyId = await getActiveCompanyId();
  if (canViewAll) return { companyId, ownProfileId: null };

  const profile = await getServerAuthProfile();
  if (!profile) return null;
  return { companyId, ownProfileId: profile.id };
}

/** WHERE compartido entre paginated, export y facets (incluye la visibilidad). */
function buildWhereClause(scope: Scope, state: FilterState): RequestWhere {
  const f = state.filters;
  const and: RequestWhere[] = [{ company_id: scope.companyId }];

  // Visibilidad: sin `view_all_requests` solo los pedidos propios
  if (scope.ownProfileId) and.push({ requested_by: scope.ownProfileId });

  and.push(buildSearchWhere(state.search, ['number', 'notes']) as RequestWhere);
  and.push(buildFiltersWhere(pickFilters(f, FACETED_COLUMNS), COLUMN_MAP) as RequestWhere);
  and.push(buildTextFiltersWhere(f, TEXT_FILTER_COLUMNS) as RequestWhere);
  and.push(buildDateRangeFiltersWhere(f, DATE_RANGE_COLUMNS) as RequestWhere);

  // Destino (texto): mismo criterio que el filtro `destination` de Movimientos
  const dest = f.destination?.[0]?.trim();
  if (dest) {
    and.push({
      OR: [
        { employee: { OR: [{ file: contains(dest) }, { lastname: contains(dest) }, { firstname: contains(dest) }] } },
        { vehicle: { OR: [{ domain: contains(dest) }, { intern_number: contains(dest) }] } },
        { other_equipment: { intern_number: contains(dest) } },
        { maintenance_order: { order_number: contains(dest) } },
        { customer: { name: contains(dest) } },
      ],
    });
  }

  return { AND: and };
}

const REQUEST_SELECT = {
  id: true,
  number: true,
  status: true,
  created_at: true,
  notes: true,
  requester: { select: { id: true, fullname: true, email: true } },
  decider: { select: { id: true, fullname: true, email: true } },
  ...DESTINATION_SELECT,
} as const;

/**
 * Avance de los pedidos de la pagina SIN N+1: una sola query agregada. Una linea esta
 * completamente entregada cuando Σ(−direction × quantity) de sus lineas de stock >= quantity.
 */
async function getProgressByRequest(requestIds: string[]): Promise<Map<string, { done: number; total: number }>> {
  if (requestIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ request_id: string; total: number; done: number }[]>`
    SELECT l.request_id,
           COUNT(*)::int AS total,
           (COUNT(*) FILTER (WHERE COALESCE(d.delivered, 0) >= l.quantity))::int AS done
    FROM material_request_lines l
    LEFT JOIN (
      SELECT sml.request_line_id, SUM(-sml.direction * sml.quantity) AS delivered
      FROM stock_movement_lines sml
      JOIN material_request_lines mrl ON mrl.id = sml.request_line_id
      WHERE mrl.request_id = ANY(${requestIds}::uuid[])
      GROUP BY sml.request_line_id
    ) d ON d.request_line_id = l.id
    WHERE l.request_id = ANY(${requestIds}::uuid[])
    GROUP BY l.request_id
  `;
  return new Map(rows.map((r) => [r.request_id, { done: r.done, total: r.total }]));
}

const profileName = (p: { fullname: string | null; email: string | null }) => p.fullname ?? p.email ?? '-';

async function shape(rows: Prisma.material_requestsGetPayload<{ select: typeof REQUEST_SELECT }>[]) {
  const progress = await getProgressByRequest(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    created_at: r.created_at,
    notes: r.notes,
    destination_type: r.destination_type,
    destination: destinationLabel(r),
    requester: { id: r.requester.id, name: profileName(r.requester) },
    decider: r.decider ? { id: r.decider.id, name: profileName(r.decider) } : null,
    progress: progress.get(r.id) ?? { done: 0, total: 0 },
  }));
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getRequestsPaginated(searchParams: DataTableSearchParams) {
  const scope = await resolveScope();
  if (!scope) return { data: [], total: 0 };

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(scope, state);

    const resolvedSorts: RequestOrderBy[] = [];
    for (const s of state.sorting) {
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const fkMapper = FK_SORT_MAP[s.id];
      if (fkMapper) resolvedSorts.push(fkMapper(dir));
      else if (VALID_SORT_FIELDS.has(s.id)) resolvedSorts.push({ [s.id]: dir });
    }
    const orderBy: RequestOrderBy[] = [...resolvedSorts, { created_at: 'desc' }, { number: 'desc' }];

    const [rows, total] = await Promise.all([
      prisma.material_requests.findMany({ where, orderBy, skip, take, select: REQUEST_SELECT }),
      prisma.material_requests.count({ where }),
    ]);
    return { data: await shape(rows), total };
  } catch (error) {
    logger.error('Error al obtener pedidos', { data: { error } });
    throw new Error('No se pudo obtener la lista de pedidos');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllRequestsForExport(searchParams: DataTableSearchParams) {
  const scope = await resolveScope();
  if (!scope) return [];

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(scope, state);
    const rows = await prisma.material_requests.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { number: 'desc' }],
      select: REQUEST_SELECT,
    });
    return await shape(rows);
  } catch (error) {
    logger.error('Error al exportar pedidos', { data: { error } });
    throw new Error('No se pudo exportar la lista de pedidos');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getRequestSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  const scope = await resolveScope();
  if (!scope) return null;

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): RequestWhere {
    const base: FilterState = parsed ?? parseSearchParams({});
    const filters = { ...base.filters };
    delete filters[excludeColumn];
    return buildWhereClause(scope as Scope, { ...base, filters });
  }

  function toFacetMap(rows: { key: string | null; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      const k = key == null ? NULL_FILTER_VALUE : key;
      map.set(k, (map.get(k) ?? 0) + count);
    }
    return map;
  }

  async function resolveProfiles(ids: string[]) {
    if (ids.length === 0) return [];
    const profiles = await prisma.profile.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullname: true, email: true },
      orderBy: { fullname: 'asc' },
    });
    return profiles.map((p) => ({ id: p.id, name: profileName(p) }));
  }

  try {
    const where = crossWhere(columnId);

    if (columnId === 'status') {
      const rows = await prisma.material_requests.groupBy({ by: ['status'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count }))) };
    }

    if (columnId === 'destination_type') {
      const rows = await prisma.material_requests.groupBy({ by: ['destination_type'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.destination_type, count: r._count }))) };
    }

    if (columnId === 'requester') {
      const rows = await prisma.material_requests.groupBy({ by: ['requested_by'], where, _count: true });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.requested_by, count: r._count }))),
        resolvedOptions: await resolveProfiles(rows.map((r) => r.requested_by)),
      };
    }

    if (columnId === 'decider') {
      const rows = await prisma.material_requests.groupBy({ by: ['decided_by'], where, _count: true });
      const ids = rows.map((r) => r.decided_by).filter((id): id is string => id != null);
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.decided_by, count: r._count }))),
        resolvedOptions: await resolveProfiles(ids),
      };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de pedidos', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type RequestListItem = Awaited<ReturnType<typeof getRequestsPaginated>>['data'][number];
