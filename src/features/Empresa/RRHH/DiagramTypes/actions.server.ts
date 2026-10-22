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
import { fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { diagramTypeCreateSchema, diagramTypeUpdateSchema } from '../../lib/catalog-input-schemas';
import { CATALOG_EXPORT_MAX_ROWS, catalogExportFailure } from '../../lib/catalog-table.server';
import { requireConfigTabPermission } from '../../lib/config-access.server';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('features/Empresa/RRHH/DiagramTypes');

// ============================================================================
// VALID SORT FIELDS — solo campos reales de BD
// ============================================================================

const LIST_SELECT = {
  id: true,
  name: true,
  color: true,
  short_description: true,
  work_active: true,
  is_active: true,
  computes_absenteeism: true,
  created_at: true,
} as const;

const VALID_SORT_FIELDS = new Set([
  'name',
  'short_description',
  'work_active',
  'is_active',
  'computes_absenteeism',
  'created_at',
]);

// ============================================================================
// WHERE BUILDER — DRY helper compartido por paginated, export y facets
// ============================================================================

/** Claves de filtro que esta tabla realmente usa; el resto de la URL se descarta antes de armar el where. */
const ALLOWED_FILTER_KEYS = new Set([
  'work_active',
  'is_active',
  'computes_absenteeism',
  'name',
  'short_description',
  ...dateRangeKeys(['created_at']),
]);

function parseState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);
}

/** Filtro facetado de un booleano: 'true' / 'false' / NULL_FILTER_VALUE (solo tiene efecto en columnas nullable). */
function buildBooleanWhere(field: string, rawValues: string[] | undefined, nullable = false) {
  // En columnas NOT NULL el valor "sin asignar" no existe: se descarta en vez de romper la consulta.
  const values = nullable ? rawValues : rawValues?.filter((v) => v !== NULL_FILTER_VALUE);
  if (!values || values.length === 0) return {};
  const toCondition = (value: string) => ({ [field]: value === NULL_FILTER_VALUE ? null : value === 'true' });
  return values.length === 1 ? toCondition(values[0]) : { OR: values.map(toCondition) };
}

function buildWhereClause(state: ReturnType<typeof parseState>) {
  // Búsqueda global en name y short_description
  const searchWhere = buildSearchWhere(state.search, ['name', 'short_description']);

  // Booleanos: work_active es nullable; is_active y computes_absenteeism son NOT NULL
  const workActiveFilter = buildBooleanWhere('work_active', state.filters['work_active'], true);
  const isActiveFilter = buildBooleanWhere('is_active', state.filters['is_active']);
  const computesFilter = buildBooleanWhere('computes_absenteeism', state.filters['computes_absenteeism']);

  // Filtros de texto libre por columna
  const textFiltersWhere = buildTextFiltersWhere(state.filters, ['name', 'short_description']);

  // Filtros de rango de fecha
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, ['created_at']);

  return {
    // Cada filtro booleano puede traer un OR: van en AND para que no se pisen entre sí ni con la búsqueda.
    AND: [searchWhere, workActiveFilter, isActiveFilter, computesFilter],
    ...textFiltersWhere,
    ...dateFiltersWhere,
  };
}

// ============================================================================
// QUERY PAGINADA
// ============================================================================

export async function getDiagramTypesPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('diagrams', 'view');
  try {
    const state = parseState(searchParams);
    const { skip, take } = stateToPrismaParams(state);

    const companyId = await getActiveCompanyId();
    const where = withCompany(buildWhereClause(state), companyId);

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
      prisma.diagram_type.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: LIST_SELECT,
      }),
      prisma.diagram_type.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener tipos de novedades', { data: { error } });
    throw new Error('No se pudo obtener la lista. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT COMPLETO — sin skip/take, mismos filtros
// ============================================================================

export async function getAllDiagramTypesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<DiagramTypeListItem[]>> {
  await requireConfigTabPermission('diagrams', 'view');
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
      listIds: (take) => prisma.diagram_type.findMany({ where, orderBy: safeOrderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.diagram_type.findMany({ where: { id: { in: ids }, company_id: companyId }, select: LIST_SELECT }),
      tooLargeMessage: tooManyRowsMessage('tipos de novedades'),
    });
    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar tipos de novedades', { data: { error } });
    return catalogExportFailure(error, 'la lista de tipos de novedades');
  }
}

// ============================================================================
// SINGLE FACET — lazy-load on-demand por columna con cross-filtering
// ============================================================================

/**
 * Retorna counts + opciones para UNA sola columna.
 * Aplica TODOS los filtros activos EXCEPTO el de la propia columna (cross-filter).
 */
export async function getDiagramTypeSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResult | null> {
  await requireConfigTabPermission('diagrams', 'view');
  try {
    const state = parseState(searchParams);

    // crossWhere: aplica todos los filtros EXCEPTO el de la columna propia
    const crossState = {
      ...state,
      filters: { ...state.filters },
    };
    delete crossState.filters[columnId];

    const companyId = await getActiveCompanyId();
    const crossWhere = withCompany(buildWhereClause(crossState), companyId);

    switch (columnId) {
      case 'work_active': {
        const rows = await prisma.diagram_type.groupBy({
          by: ['work_active'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          if (r.work_active === null) {
            counts.set(NULL_FILTER_VALUE, r._count);
          } else {
            counts.set(String(r.work_active), r._count);
          }
        }

        return {
          options: [
            { value: 'true', label: 'Trabajando' },
            { value: 'false', label: 'No trabajando' },
            ...(counts.has(NULL_FILTER_VALUE) ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar' }] : []),
          ],
          counts,
        };
      }

      case 'is_active': {
        const rows = await prisma.diagram_type.groupBy({
          by: ['is_active'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          counts.set(String(r.is_active), r._count);
        }

        return {
          options: [
            { value: 'true', label: 'Activo' },
            { value: 'false', label: 'Inactivo' },
          ],
          counts,
        };
      }

      case 'computes_absenteeism': {
        const rows = await prisma.diagram_type.groupBy({
          by: ['computes_absenteeism'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          counts.set(String(r.computes_absenteeism), r._count);
        }

        return {
          options: [
            { value: 'true', label: 'Computa ausentismo' },
            { value: 'false', label: 'No computa ausentismo' },
          ],
          counts,
        };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener faceta de tipo de novedad', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// MUTACIONES — crear y actualizar con Prisma
// ============================================================================

export async function createDiagramTypePrisma(data: {
  name: string;
  color: string;
  short_description: string;
  work_active: boolean;
  is_active: boolean;
  computes_absenteeism: boolean;
}) {
  await requireConfigTabPermission('diagrams', 'create');
  data = diagramTypeCreateSchema.parse(data);
  try {
    const company_id = await getActiveCompanyId();

    const result = await prisma.diagram_type.create({
      data: {
        name: data.name,
        color: data.color,
        short_description: data.short_description.toUpperCase(),
        work_active: data.work_active,
        is_active: data.is_active,
        computes_absenteeism: data.computes_absenteeism,
      },
      select: {
        id: true,
        name: true,
        color: true,
        short_description: true,
        work_active: true,
        is_active: true,
        computes_absenteeism: true,
        created_at: true,
      },
    });
    return result;
  } catch (error) {
    logger.error('Error al crear tipo de novedad', { data: { error } });
    throw new Error('No se pudo crear el tipo de novedad. Intente nuevamente.');
  }
}

export async function updateDiagramTypePrisma(data: {
  id: string;
  name: string;
  color: string;
  short_description: string;
  work_active: boolean;
  is_active: boolean;
  computes_absenteeism: boolean;
}) {
  await requireConfigTabPermission('diagrams', 'update');
  data = diagramTypeUpdateSchema.parse(data);
  try {
    // Perímetro sin RLS: sólo se edita un tipo de novedad de la empresa activa.
    const companyId = await getActiveCompanyId();
    const owned = await prisma.diagram_type.findFirst({
      where: withCompany({ id: data.id }, companyId),
      select: { id: true },
    });
    if (!owned) throw new Error('Tipo de novedad no encontrado');

    const result = await prisma.diagram_type.update({
      where: { id: data.id },
      data: {
        name: data.name,
        color: data.color,
        short_description: data.short_description.toUpperCase(),
        work_active: data.work_active,
        is_active: data.is_active,
        computes_absenteeism: data.computes_absenteeism,
      },
      select: {
        id: true,
        name: true,
        color: true,
        short_description: true,
        work_active: true,
        is_active: true,
        computes_absenteeism: true,
        created_at: true,
      },
    });
    return result;
  } catch (error) {
    logger.error('Error al actualizar tipo de novedad', { data: { error } });
    throw new Error('No se pudo actualizar el tipo de novedad. Intente nuevamente.');
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type DiagramTypeListItem = Awaited<ReturnType<typeof getDiagramTypesPaginated>>['data'][number];
