'use server';

import { pickFilters } from '../../../lib/filters';
import { employeeLabel } from '../../../lib/labels';
import { checkPermissionServer } from '@/features/Permissions';
import type { Prisma } from '@/generated/prisma/client';
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

const logger = new Logger('features/Warehouses/Depots/DepotsList');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de `warehouses` ordenables server-side + columnas FK (via FK_SORT_MAP). */
const VALID_SORT_FIELDS = new Set(['code', 'name', 'address', 'is_active', 'manager', 'fileNumber', 'created_at']);

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Prisma.warehousesOrderByWithRelationInput> = {
  manager: (dir) => ({ manager: { lastname: dir } }),
  fileNumber: (dir) => ({ manager: { file: dir } }),
};

const TEXT_FILTER_COLUMNS = ['code', 'name', 'address'];
const DATE_RANGE_COLUMNS = ['created_at'];

/** Unicas columnas que pasan por `buildFiltersWhere` (lista de permitidas, ver `lib/filters.ts`). */
const FACETED_COLUMNS = ['manager'] as const;

/** columnId (URL) -> campo Prisma, solo donde difieren. */
const COLUMN_MAP: Record<string, string> = { manager: 'manager_employee_id' };

const DEPOT_SELECT = {
  id: true,
  code: true,
  name: true,
  address: true,
  is_active: true,
  created_at: true,
  manager: { select: { id: true, file: true, lastname: true, firstname: true } },
} as const;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/** WHERE compartido entre paginated, export y facets. */
function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>): Prisma.warehousesWhereInput {
  const and: Prisma.warehousesWhereInput[] = [{ company_id: companyId }];

  and.push(buildSearchWhere(state.search, ['code', 'name', 'address']) as Prisma.warehousesWhereInput);
  and.push(
    buildFiltersWhere(pickFilters(state.filters, FACETED_COLUMNS), COLUMN_MAP) as Prisma.warehousesWhereInput
  );
  and.push(buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS) as Prisma.warehousesWhereInput);

  and.push(buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS) as Prisma.warehousesWhereInput);

  // Booleano: llega como 'true' / 'false'
  const active = state.filters.is_active;
  if (active?.length) {
    // Ambos valores seleccionados = sin filtro
    if (active.length === 1) and.push({ is_active: active[0] === 'true' });
  }

  // Legajo del responsable: coincidencia EXACTA (los legajos son cortos; "1" no debe traer "10").
  const file = state.filters.fileNumber?.[0]?.trim();
  if (file) {
    and.push({ manager: { file: { equals: file, mode: 'insensitive' } } });
  }

  return { AND: and };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getDepotsPaginated(searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer('almacenes', 'depositos', 'view'))) {
    return { data: [], total: 0 };
  }
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);

    const resolvedSorts: Prisma.warehousesOrderByWithRelationInput[] = [];
    for (const s of state.sorting) {
      if (!VALID_SORT_FIELDS.has(s.id)) continue;
      const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
      const fkMapper = FK_SORT_MAP[s.id];
      resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
    }
    // Inactivos SIEMPRE al final, sin importar el orden del usuario.
    const orderBy: Prisma.warehousesOrderByWithRelationInput[] = [
      { is_active: 'desc' },
      ...resolvedSorts.filter((s) => !('is_active' in s)),
      { name: 'asc' },
    ];

    const [data, total] = await Promise.all([
      prisma.warehouses.findMany({ where, orderBy, skip, take, select: DEPOT_SELECT }),
      prisma.warehouses.count({ where }),
    ]);
    return { data, total };
  } catch (error) {
    logger.error('Error al obtener depositos', { data: { error } });
    throw new Error('No se pudo obtener la lista de depositos');
  }
}

// ============================================================================
// EXPORT (sin paginacion)
// ============================================================================

export async function getAllDepotsForExport(searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer('almacenes', 'depositos', 'view'))) return [];
  const companyId = await getActiveCompanyId();

  try {
    const state = parseSearchParams(searchParams);
    const where = buildWhereClause(companyId, state);
    return await prisma.warehouses.findMany({
      where,
      orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
      select: DEPOT_SELECT,
    });
  } catch (error) {
    logger.error('Error al exportar depositos', { data: { error } });
    throw new Error('No se pudo exportar la lista de depositos');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filter)
// ============================================================================

export async function getDepotSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{ counts: Map<string, number>; resolvedOptions?: Array<{ id: string; name: string | null }> } | null> {
  if (!(await checkPermissionServer('almacenes', 'depositos', 'view'))) return null;
  const companyId = await getActiveCompanyId();

  const parsed = searchParams && Object.keys(searchParams).length > 0 ? parseSearchParams(searchParams) : null;

  /** WHERE con todos los filtros activos MENOS el de la columna que se esta abriendo. */
  function crossWhere(excludeColumn: string): Prisma.warehousesWhereInput {
    if (!parsed) return { company_id: companyId };
    const filters = { ...parsed.filters };
    delete filters[excludeColumn];
    return buildWhereClause(companyId, { ...parsed, filters });
  }

  function toFacetMap(rows: { key: string | boolean | null; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      const k = key == null ? NULL_FILTER_VALUE : String(key);
      map.set(k, (map.get(k) ?? 0) + count);
    }
    return map;
  }

  try {
    const where = crossWhere(columnId);

    if (columnId === 'is_active') {
      const rows = await prisma.warehouses.groupBy({ by: ['is_active'], where, _count: true });
      return { counts: toFacetMap(rows.map((r) => ({ key: r.is_active, count: r._count }))) };
    }

    if (columnId === 'manager') {
      const rows = await prisma.warehouses.groupBy({ by: ['manager_employee_id'], where, _count: true });
      const counts = toFacetMap(rows.map((r) => ({ key: r.manager_employee_id, count: r._count })));
      const ids = rows.map((r) => r.manager_employee_id).filter((id): id is string => id != null);
      const employees = ids.length
        ? await prisma.employees.findMany({
            where: { id: { in: ids } },
            select: { id: true, file: true, lastname: true, firstname: true },
            orderBy: { lastname: 'asc' },
          })
        : [];
      return {
        counts,
        resolvedOptions: employees.map((e) => ({ id: e.id, name: employeeLabel(e) })),
      };
    }

    logger.warn('Facet no reconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet de depositos', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type DepotListItem = Awaited<ReturnType<typeof getDepotsPaginated>>['data'][number];
