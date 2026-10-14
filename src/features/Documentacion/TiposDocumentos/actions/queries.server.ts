'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import type { Prisma } from '@/generated/prisma/client';
import { document_applies } from '@/generated/prisma/enums';
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
import { buildConditionsWhereClause, parseDocumentConditions } from '../lib/document-conditions';
import { documentTypeCompanyScope, findScopedDocumentType } from '../lib/document-type-scope';

// NOTE: document_applies is NOT re-exported from 'use server' files.
// Callers must import it directly from '@/generated/prisma/enums'.

const logger = new Logger('features/TiposDocumentos/queries');

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_SORT_FIELDS = new Set([
  'name',
  'mandatory',
  'explired',
  'special',
  'multiresource',
  'has_policy_number',
  'is_it_montlhy',
  'private',
  'down_document',
  'created_at',
  'equipment_type',
  'applies',
  'is_active',
]);

/** Params de URL que NO son filtros de la tabla */
const IGNORED_PARAMS = new Set(['tab', 'subtab']);

/** Columnas de texto libre */
const TEXT_FILTER_COLUMNS = ['name', 'description'];

/** Columnas de rango de fecha */
const DATE_RANGE_COLUMNS = ['created_at'];

/** Columnas booleanas (llegan como string 'true'/'false' desde los filtros facetados) */
const BOOLEAN_FILTER_COLUMNS = [
  'mandatory',
  'explired',
  'special',
  'multiresource',
  'has_policy_number',
  'is_it_montlhy',
  'private',
  'down_document',
  'is_active',
] as const;

type BooleanFilterColumn = (typeof BOOLEAN_FILTER_COLUMNS)[number];

// ============================================================================
// SELECT — excluye 'conditions' (JSON pesado, se carga solo en edición)
// ============================================================================

const DOC_TYPE_SELECT = {
  id: true,
  name: true,
  applies: true,
  multiresource: true,
  has_policy_number: true,
  mandatory: true,
  explired: true,
  special: true,
  is_active: true,
  description: true,
  company_id: true,
  is_it_montlhy: true,
  private: true,
  down_document: true,
  available_for_pre_file: true,
  equipment_type: true,
  created_at: true,
} as const;

/** Select para edición: DOC_TYPE_SELECT + `conditions` (JSON pesado, sólo acá). */
const DOC_TYPE_EDIT_SELECT = { ...DOC_TYPE_SELECT, conditions: true } as const;

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

const PRIVATE_PERMISSION_TAB: Record<string, string> = {
  Persona: 'tipos-docs-personas',
  Equipos: 'tipos-docs-equipos',
  Empresa: 'tipos-docs-empresa',
};

/**
 * Construye el WHERE clause compartido entre paginated, export y facets.
 * El parámetro `applies` se aplica como filtro fijo (scope de tab).
 * Filtra tipos de documento privados si el usuario no tiene permiso `view_private`.
 */
async function buildWhereClause(
  applies: document_applies,
  companyId: string,
  state: ReturnType<typeof parseSearchParams>
): Promise<Prisma.document_typesWhereInput> {
  const tabSlug = PRIVATE_PERMISSION_TAB[applies];
  const canViewPrivate = tabSlug ? await checkPermissionServer('documentacion', tabSlug, 'view_private') : true;
  const searchWhere = buildSearchWhere(state.search, ['name', 'description']);

  const filtersWhere = buildFiltersWhere(
    state.filters,
    {},
    {
      exclude: [
        ...TEXT_FILTER_COLUMNS,
        ...(BOOLEAN_FILTER_COLUMNS as readonly string[]),
        ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`]),
      ],
    }
  );

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS);

  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  // Boolean filters: convert string 'true'/'false' → actual boolean
  const boolFilters: Record<string, boolean | { in: boolean[] }> = {};
  for (const col of BOOLEAN_FILTER_COLUMNS) {
    const values = state.filters[col];
    if (!values?.length) continue;
    const boolValues = values.filter((v) => v === 'true' || v === 'false').map((v) => v === 'true');
    if (boolValues.length === 0) continue;
    boolFilters[col] = boolValues.length === 1 ? boolValues[0] : { in: boolValues };
  }

  return {
    applies,
    // Tipos globales (company_id NULL) + los propios de la empresa activa. Va en AND porque
    // `searchWhere` ya usa OR.
    AND: [documentTypeCompanyScope(companyId)],
    ...searchWhere,
    ...filtersWhere,
    ...textFiltersWhere,
    ...dateFiltersWhere,
    ...boolFilters,
    ...(!canViewPrivate && { private: { not: true } }),
  };
}

// ============================================================================
// PAGINATED QUERY (PRIVATE BASE)
// ============================================================================

async function getDocTypesPaginated(applies: document_applies, searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();
  try {
    const state = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete state.filters[key];
    }

    const { skip, take } = stateToPrismaParams(state);
    const where = await buildWhereClause(applies, companyId, state);

    // Safe multi-sort, only whitelisted fields
    const resolvedSorts: Record<string, 'asc' | 'desc'>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    // Inactivos siempre al final, luego por nombre
    const safeOrderBy = [{ is_active: 'desc' as const }, ...resolvedSorts, { name: 'asc' as const }];

    const [rows, total] = await Promise.all([
      prisma.document_types.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: { ...DOC_TYPE_SELECT, conditions: true },
      }),
      prisma.document_types.count({ where }),
    ]);

    // Al cliente solo viaja la cantidad de condiciones efectivas (pill "N condiciones"), no el JSON.
    const data = rows.map(({ conditions, ...rest }) => ({
      ...rest,
      conditions_count: parseDocumentConditions(conditions).length,
    }));

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener tipos de documento paginados', {
      data: { error, applies },
    });
    throw new Error(`Error al obtener tipos de documento: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// PUBLIC WRAPPERS — one per tab
// ============================================================================

export async function getPersonasDocTypesPaginated(searchParams: DataTableSearchParams) {
  return getDocTypesPaginated(document_applies.Persona, searchParams);
}

export async function getEquiposDocTypesPaginated(searchParams: DataTableSearchParams) {
  return getDocTypesPaginated(document_applies.Equipos, searchParams);
}

export async function getEmpresaDocTypesPaginated(searchParams: DataTableSearchParams) {
  return getDocTypesPaginated(document_applies.Empresa, searchParams);
}

// ============================================================================
// EXPORT QUERIES (no skip/take)
// ============================================================================

async function getDocTypesForExport(applies: document_applies, searchParams: DataTableSearchParams) {
  const companyId = await getActiveCompanyId();
  try {
    const state = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete state.filters[key];
    }

    const where = await buildWhereClause(applies, companyId, state);

    const rows = await prisma.document_types.findMany({
      orderBy: [{ name: 'asc' }],
      where,
      select: { ...DOC_TYPE_SELECT, conditions: true },
    });

    // Misma forma que la lista paginada (la tabla tipa sus filas y su export con un único TData).
    return rows.map(({ conditions, ...rest }) => ({
      ...rest,
      conditions_count: parseDocumentConditions(conditions).length,
    }));
  } catch (error) {
    logger.error('Error al exportar tipos de documento', { data: { error, applies } });
    throw new Error('Error al exportar tipos de documento');
  }
}

export async function getPersonasDocTypesForExport(searchParams: DataTableSearchParams) {
  return getDocTypesForExport(document_applies.Persona, searchParams);
}

export async function getEquiposDocTypesForExport(searchParams: DataTableSearchParams) {
  return getDocTypesForExport(document_applies.Equipos, searchParams);
}

export async function getEmpresaDocTypesForExport(searchParams: DataTableSearchParams) {
  return getDocTypesForExport(document_applies.Empresa, searchParams);
}

// ============================================================================
// GET FOR EDIT (loads conditions JSON)
// ============================================================================

/**
 * Obtiene un tipo de documento completo (incluyendo conditions) para edición.
 */
export async function getDocumentTypeForEdit(id: string) {
  logger.debug('Obteniendo tipo de documento para editar', { data: { id } });

  try {
    const companyId = await getActiveCompanyId();
    return await findScopedDocumentType(prisma, id, companyId, DOC_TYPE_EDIT_SELECT);
  } catch (error) {
    logger.error('Error al obtener tipo de documento para editar', {
      data: { error, id },
    });
    throw error;
  }
}

// ============================================================================
// COUNT MATCHING RESOURCES — contador en tiempo real para condiciones
// ============================================================================

/**
 * Cuenta cuántos recursos (empleados o equipos) de la empresa activa cumplen las condiciones.
 * El JSON se parsea con `parseDocumentConditions` y se traduce a un `where` de Prisma con la
 * misma semántica que `resourceMatchesConditions` (todas las condiciones, simples y M:M).
 */
export async function countMatchingResources(applies: string, conditionsJson: Prisma.JsonValue[]): Promise<number> {
  const companyId = await getActiveCompanyId();

  logger.debug('Contando recursos para condiciones', { data: { applies } });

  try {
    if (applies !== 'Persona' && applies !== 'Equipos') return 0;

    const conditionsWhere = buildConditionsWhereClause(applies, parseDocumentConditions(conditionsJson));
    const where = { company_id: companyId, is_active: true, ...conditionsWhere };

    if (applies === 'Persona') {
      return await prisma.employees.count({ where: where as Prisma.employeesWhereInput });
    }
    return await prisma.vehicles.count({ where: where as Prisma.vehiclesWhereInput });
  } catch (error) {
    logger.error('Error al contar recursos para condiciones', { data: { error, applies } });
    return 0;
  }
}

// ============================================================================
// SINGLE FACET (lazy-load con cross-filtering)
// ============================================================================

// ============================================================================
// SINGLE FACET (lazy-load con cross-filtering)
// ============================================================================

/**
 * Obtiene opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Diseñado para lazy-load: cada filtro llama a esta función al abrirse.
 */
export async function getDocTypeSingleFacet(
  columnId: string,
  applies: document_applies,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  const companyId = await getActiveCompanyId();
  const baseWhere: Prisma.document_typesWhereInput = { applies, AND: [documentTypeCompanyScope(companyId)] };

  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
    for (const key of IGNORED_PARAMS) {
      delete parsedState.filters[key];
    }
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  async function crossWhere(excludeColumn: string) {
    if (!parsedState || !hasActiveFilters) return baseWhere;
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[excludeColumn];
    delete modified.filters[`${excludeColumn}_from`];
    delete modified.filters[`${excludeColumn}_to`];
    return await buildWhereClause(applies, companyId, modified);
  }

  function toFacetMap(rows: { key: string | boolean | null | undefined; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      if (key == null) {
        map.set(NULL_FILTER_VALUE, (map.get(NULL_FILTER_VALUE) ?? 0) + count);
      } else {
        map.set(String(key), count);
      }
    }
    return map;
  }

  try {
    const where = await crossWhere(columnId);

    // ── Boolean columns ──
    if (BOOLEAN_FILTER_COLUMNS.includes(columnId as BooleanFilterColumn)) {
      const field = columnId as BooleanFilterColumn;
      const rows = await prisma.document_types.groupBy({
        by: [field],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(
          rows.map((r) => ({
            key: String((r as Record<string, unknown>)[field]),
            count: r._count,
          }))
        ),
      };
    }

    // ── is_active (boolean facet) ──
    if (columnId === 'is_active') {
      const rows = await prisma.document_types.groupBy({
        by: ['is_active'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(
          rows.map((r) => ({
            key: String(r.is_active),
            count: r._count,
          }))
        ),
      };
    }

    // ── equipment_type (text facet — treated as enum-like) ──
    if (columnId === 'equipment_type') {
      const rows = await prisma.document_types.groupBy({
        by: ['equipment_type'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.equipment_type, count: r._count }))),
      };
    }

    logger.warn('Facet column not recognized for document_types', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual de tipos de documento', {
      data: { error, columnId, applies },
    });
    return null;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type DocumentTypeListItem = Awaited<ReturnType<typeof getDocTypesPaginated>>['data'][number];
export type DocumentTypeExportItem = Awaited<ReturnType<typeof getPersonasDocTypesForExport>>[number];
export type DocumentTypeForEdit = Awaited<ReturnType<typeof getDocumentTypeForEdit>>;
