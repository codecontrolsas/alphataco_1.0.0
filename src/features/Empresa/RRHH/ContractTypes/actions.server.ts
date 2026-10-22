'use server';

import { Logger } from '@/lib/logger';
import type { DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable/types';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import { fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { contractTypeCreateSchema, contractTypeUpdateSchema } from '../../lib/catalog-input-schemas';
import {
  CATALOG_EXPORT_MAX_ROWS,
  buildIsActiveWhere,
  catalogExportFailure,
  catalogTooLargeMessage,
} from '../../lib/catalog-table.server';
import { requireConfigTabPermission } from '../../lib/config-access.server';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('features/Empresa/RRHH/ContractTypes');

// ============================================================================
// VALID SORT FIELDS — solo campos reales de BD
// ============================================================================

const LIST_SELECT = { id: true, name: true, description: true, is_active: true, created_at: true } as const;

const VALID_SORT_FIELDS = new Set(['name', 'description', 'is_active', 'created_at']);

// ============================================================================
// WHERE BUILDER — DRY helper compartido por paginated, export y facets
// ============================================================================

/** Claves de filtro que esta tabla realmente usa; el resto de la URL se descarta antes de armar el where. */
const ALLOWED_FILTER_KEYS = new Set(['is_active', 'name', 'description', ...dateRangeKeys(['created_at'])]);

function parseState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);
}

function buildWhereClause(state: ReturnType<typeof parseState>) {
  // Búsqueda global en name y description
  const searchWhere = buildSearchWhere(state.search, ['name', 'description']);

  // is_active (booleano nullable): 'true' / 'false' / NULL_FILTER_VALUE
  const isActiveFilter = buildIsActiveWhere(state.filters['is_active']);

  // Filtros de texto libre por columna
  const textFiltersWhere = buildTextFiltersWhere(state.filters, ['name', 'description']);

  // Filtros de rango de fecha
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, ['created_at']);

  return {
    // La búsqueda y el filtro de estado pueden traer un OR cada uno: van en AND para que no se pisen.
    AND: [searchWhere, isActiveFilter],
    ...textFiltersWhere,
    ...dateFiltersWhere,
  };
}

// ============================================================================
// QUERY PAGINADA
// ============================================================================

export async function getContractTypesPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('contract-types', 'view');
  try {
    const state = parseState(searchParams);
    const { skip, take } = stateToPrismaParams(state);

    const where = withCompany(buildWhereClause(state), await getActiveCompanyId());

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
      prisma.types_of_contract.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: LIST_SELECT,
      }),
      prisma.types_of_contract.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener tipos de contrato', { data: { error } });
    throw new Error('No se pudo obtener la lista. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT COMPLETO — sin skip/take, mismos filtros
// ============================================================================

export async function getAllContractTypesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<ContractTypeListItem[]>> {
  await requireConfigTabPermission('contract-types', 'view');
  try {
    const state = parseState(searchParams);
    const companyId = await getActiveCompanyId();
    const where = withCompany(buildWhereClause(state), companyId);

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

    const rows = await fetchExportRowsInBatches({
      maxRows: CATALOG_EXPORT_MAX_ROWS,
      listIds: (take) => prisma.types_of_contract.findMany({ where, orderBy: safeOrderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.types_of_contract.findMany({ where: { id: { in: ids }, company_id: companyId }, select: LIST_SELECT }),
      tooLargeMessage: catalogTooLargeMessage('tipos de contrato'),
    });
    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar tipos de contrato', { data: { error } });
    return catalogExportFailure(error, 'la lista de tipos de contrato');
  }
}

// ============================================================================
// SINGLE FACET — lazy-load on-demand por columna con cross-filtering
// ============================================================================

/**
 * Retorna counts + opciones para UNA sola columna.
 * Aplica TODOS los filtros activos EXCEPTO el de la propia columna (cross-filter).
 */
export async function getContractTypeSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResult | null> {
  await requireConfigTabPermission('contract-types', 'view');
  try {
    const state = parseState(searchParams);

    // crossWhere: aplica todos los filtros EXCEPTO el de la columna propia
    const crossState = {
      ...state,
      filters: { ...state.filters },
    };
    delete crossState.filters[columnId];

    const crossWhere = withCompany(buildWhereClause(crossState), await getActiveCompanyId());

    switch (columnId) {
      case 'is_active': {
        const rows = await prisma.types_of_contract.groupBy({
          by: ['is_active'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
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
    logger.error('Error al obtener faceta de tipo de contrato', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// MUTACIONES — crear y actualizar con Prisma
// ============================================================================

export async function createContractTypePrisma(data: { name: string; description: string | null }) {
  await requireConfigTabPermission('contract-types', 'create');
  data = contractTypeCreateSchema.parse(data);
  try {
    const result = await prisma.types_of_contract.create({
      data: {
        name: data.name,
        description: data.description,
        is_active: true,
      },
      select: { id: true, name: true, description: true, is_active: true, created_at: true },
    });
    return result;
  } catch (error) {
    logger.error('Error al crear tipo de contrato', { data: { error } });
    throw new Error('No se pudo crear el tipo de contrato. Intente nuevamente.');
  }
}

export async function updateContractTypePrisma(data: {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}) {
  await requireConfigTabPermission('contract-types', 'update');
  data = contractTypeUpdateSchema.parse(data);
  try {
    // Perímetro sin RLS: sólo se edita un tipo de contrato de la empresa activa.
    const companyId = await getActiveCompanyId();
    const owned = await prisma.types_of_contract.findFirst({
      where: withCompany({ id: data.id }, companyId),
      select: { id: true },
    });
    if (!owned) throw new Error('Tipo de contrato no encontrado');

    const result = await prisma.types_of_contract.update({
      where: { id: data.id },
      data: {
        name: data.name,
        description: data.description,
        is_active: data.is_active,
      },
      select: { id: true, name: true, description: true, is_active: true, created_at: true },
    });
    return result;
  } catch (error) {
    logger.error('Error al actualizar tipo de contrato', { data: { error } });
    throw new Error('No se pudo actualizar el tipo de contrato. Intente nuevamente.');
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type ContractTypeListItem = Awaited<ReturnType<typeof getContractTypesPaginated>>['data'][number];
