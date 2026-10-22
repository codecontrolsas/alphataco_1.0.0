'use server';

import { Logger } from '@/lib/logger';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable/types';
import { ExportTooLargeError, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { equipmentBrandCreateSchema, equipmentBrandUpdateSchema } from '../../lib/catalog-input-schemas';
import { CATALOG_EXPORT_MAX_ROWS, buildIsActiveWhere, catalogExportFailure } from '../../lib/catalog-table.server';
import { requireConfigTabPermission } from '../../lib/config-access.server';
import { catalogAccessError, catalogReadScope, catalogWriteScope, resolveCatalogAccess } from '../lib/catalog-scope';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('features/Empresa/Equipos/EquipmentBrands');

// ============================================================================
// VALID SORT FIELDS — solo campos reales de BD
// ============================================================================

const VALID_SORT_FIELDS = new Set(['name', 'is_active', 'created_at']);

// ============================================================================
// WHERE BUILDER — DRY helper compartido por paginated, export y facets
// ============================================================================

/** Claves de filtro que esta tabla realmente usa; el resto de la URL se descarta antes de armar el where. */
const ALLOWED_FILTER_KEYS = new Set(['is_active', 'name', ...dateRangeKeys(['created_at'])]);

function parseState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);
}

/** Mismo where para lista, export y facets. Búsqueda, estado y alcance van en AND para que sus OR no se pisen. */
function buildWhereClause(state: ReturnType<typeof parseState>, companyId: string) {
  return {
    AND: [
      buildSearchWhere(state.search, ['name']),
      buildIsActiveWhere(state.filters['is_active']),
      buildTextFiltersWhere(state.filters, ['name']),
      buildDateRangeFiltersWhere(state.filters, ['created_at']),
      catalogReadScope(companyId),
    ],
  };
}

const LIST_SELECT = { id: true, name: true, is_active: true, created_at: true } as const;

// ============================================================================
// QUERY PAGINADA
// ============================================================================

export async function getEquipmentBrandsPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('marcas', 'view');
  try {
    const state = parseState(searchParams);
    const { skip, take } = stateToPrismaParams(state);

    const where = buildWhereClause(state, await getActiveCompanyId());

    // Resolución de multi-sort
    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    // Inactivos siempre al final, luego orden del usuario, luego nombre como fallback
    const safeOrderBy = [{ is_active: 'desc' as const }, ...resolvedSorts, { name: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.brand_vehicles.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: LIST_SELECT,
      }),
      prisma.brand_vehicles.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener marcas de equipos', { data: { error } });
    throw new Error('No se pudo obtener la lista. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT COMPLETO — sin skip/take, mismos filtros
// ============================================================================

export async function getAllEquipmentBrandsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<EquipmentBrandListItem[]>> {
  await requireConfigTabPermission('marcas', 'view');
  try {
    const state = parseState(searchParams);
    const where = buildWhereClause(state, await getActiveCompanyId());

    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    const safeOrderBy = [
      { is_active: 'desc' as const },
      ...resolvedSorts,
      { name: 'asc' as const },
      { id: 'asc' as const },
    ];

    // Catálogo chico con id numérico: una sola consulta acotada al tope (pide una fila de más para detectarlo).
    const rows = await prisma.brand_vehicles.findMany({
      where,
      orderBy: safeOrderBy,
      select: LIST_SELECT,
      take: CATALOG_EXPORT_MAX_ROWS + 1,
    });
    if (rows.length > CATALOG_EXPORT_MAX_ROWS) {
      throw new ExportTooLargeError(tooManyRowsMessage('marcas')(CATALOG_EXPORT_MAX_ROWS));
    }
    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar marcas de equipos', { data: { error } });
    return catalogExportFailure(error, 'la lista de marcas');
  }
}

// ============================================================================
// SINGLE FACET — lazy-load on-demand por columna con cross-filtering
// ============================================================================

/**
 * Retorna counts + opciones para UNA sola columna.
 * Aplica TODOS los filtros activos EXCEPTO el de la propia columna (cross-filter).
 */
export async function getEquipmentBrandSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResult | null> {
  await requireConfigTabPermission('marcas', 'view');
  try {
    const state = parseState(searchParams);

    // crossWhere: aplica todos los filtros EXCEPTO el de la columna propia
    const crossState = {
      ...state,
      filters: { ...state.filters },
    };
    delete crossState.filters[columnId];

    const crossWhere = buildWhereClause(crossState, await getActiveCompanyId());

    switch (columnId) {
      case 'is_active': {
        const rows = await prisma.brand_vehicles.groupBy({
          by: ['is_active'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          // is_active es Boolean? (nullable): el null se cuenta bajo NULL_FILTER_VALUE
          counts.set(r.is_active === null ? NULL_FILTER_VALUE : String(r.is_active), r._count);
        }

        return {
          options: [
            { value: 'true', label: 'Activo' },
            { value: 'false', label: 'Inactivo' },
            ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar' }] : []),
          ],
          counts,
        };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener faceta de marca de equipo', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// MUTACIONES — crear y actualizar con Prisma
// ============================================================================

export async function createEquipmentBrand(data: { name: string; is_active: boolean }) {
  await requireConfigTabPermission('marcas', 'create');
  data = equipmentBrandCreateSchema.parse(data);
  try {
    const result = await prisma.brand_vehicles.create({
      data: {
        name: data.name,
        is_active: data.is_active,
        ...catalogWriteScope(await getActiveCompanyId()),
      },
      select: { id: true, name: true, is_active: true, created_at: true },
    });
    return result;
  } catch (error) {
    logger.error('Error al crear marca de equipo', { data: { error } });
    throw new Error('No se pudo crear la marca. Intente nuevamente.');
  }
}

export async function updateEquipmentBrand(data: { id: number; name: string; is_active: boolean }) {
  await requireConfigTabPermission('marcas', 'update');
  data = equipmentBrandUpdateSchema.parse(data);
  try {
    // Perímetro sin RLS: una marca global se lee pero no se edita desde una empresa.
    const companyId = await getActiveCompanyId();
    const existing = await prisma.brand_vehicles.findUnique({ where: { id: data.id }, select: { company_id: true } });
    const accessError = catalogAccessError(resolveCatalogAccess(existing, companyId, 'write'), 'La marca no existe');
    if (accessError) throw new Error(accessError);

    const result = await prisma.brand_vehicles.update({
      where: { id: data.id },
      data: {
        name: data.name,
        is_active: data.is_active,
      },
      select: { id: true, name: true, is_active: true, created_at: true },
    });
    return result;
  } catch (error) {
    logger.error('Error al actualizar marca de equipo', { data: { error } });
    throw error instanceof Error ? error : new Error('No se pudo actualizar la marca. Intente nuevamente.');
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type EquipmentBrandListItem = Awaited<ReturnType<typeof getEquipmentBrandsPaginated>>['data'][number];
