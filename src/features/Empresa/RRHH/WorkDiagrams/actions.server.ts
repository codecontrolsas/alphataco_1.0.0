'use server';

import { Logger } from '@/lib/logger';
import type { DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable';
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
import { z } from 'zod';
import { workDiagramCreateSchema, workDiagramUpdateSchema } from '../../lib/catalog-input-schemas';
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

const logger = new Logger('features/Empresa/RRHH/WorkDiagrams');

// ============================================================================
// VALID SORT FIELDS — solo campos reales de BD
// ============================================================================

const LIST_SELECT = {
  id: true,
  name: true,
  is_active: true,
  active_working_days: true,
  inactive_working_days: true,
  inactive_novelty: true,
  created_at: true,
  diagram_type: {
    select: { id: true, name: true },
  },
  work_diagram_active_novelties: {
    select: {
      id: true,
      diagram_type: {
        select: { id: true, name: true },
      },
    },
  },
} as const;

/** Decimal → number para que sea compatible con las props Server→Client. */
function serializeDiagram<
  Row extends {
    active_working_days: { toString(): string } | null;
    inactive_working_days: { toString(): string } | null;
  },
>(item: Row) {
  return {
    ...item,
    active_working_days: item.active_working_days !== null ? Number(item.active_working_days) : null,
    inactive_working_days: item.inactive_working_days !== null ? Number(item.inactive_working_days) : null,
  };
}

const VALID_SORT_FIELDS = new Set(['name', 'is_active', 'created_at', 'active_working_days', 'inactive_working_days']);

// ============================================================================
// WHERE BUILDER — DRY helper compartido por paginated, export y facets
// ============================================================================

/** Claves de filtro que esta tabla realmente usa; el resto de la URL se descarta antes de armar el where. */
const ALLOWED_FILTER_KEYS = new Set([
  'is_active',
  'inactive_novelty',
  'active_novelties',
  'name',
  'active_working_days',
  'inactive_working_days',
  ...dateRangeKeys(['created_at']),
]);

function parseState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);
}

function buildWhereClause(state: ReturnType<typeof parseState>) {
  // Búsqueda global sobre nombre
  const searchWhere = buildSearchWhere(state.search, ['name']);

  // is_active (booleano nullable): 'true' / 'false' / NULL_FILTER_VALUE
  const isActiveFilter = buildIsActiveWhere(state.filters['is_active']);

  // Filtro FK UUID: inactive_novelty (diagram_type)
  const inactiveNoveltyValues = state.filters['inactive_novelty'];
  const inactiveNoveltyFilter: Record<string, unknown> = {};
  if (inactiveNoveltyValues?.length) {
    const realIds = inactiveNoveltyValues.filter((v) => v !== NULL_FILTER_VALUE);
    const hasNull = inactiveNoveltyValues.includes(NULL_FILTER_VALUE);
    if (hasNull && realIds.length > 0) {
      inactiveNoveltyFilter.OR = [
        { inactive_novelty: null },
        { inactive_novelty: realIds.length === 1 ? realIds[0] : { in: realIds } },
      ];
    } else if (hasNull) {
      inactiveNoveltyFilter.inactive_novelty = null;
    } else {
      inactiveNoveltyFilter.inactive_novelty = realIds.length === 1 ? realIds[0] : { in: realIds };
    }
  }

  // Filtro M:M: active_novelties (work_diagram_active_novelties → diagram_type)
  const activeNoveltiesValues = state.filters['active_novelties'];
  const activeNoveltiesFilter: Record<string, unknown> = {};
  if (activeNoveltiesValues?.length) {
    const realIds = activeNoveltiesValues.filter((v) => v !== NULL_FILTER_VALUE);
    const hasNull = activeNoveltiesValues.includes(NULL_FILTER_VALUE);
    if (hasNull && realIds.length > 0) {
      activeNoveltiesFilter.OR = [
        { work_diagram_active_novelties: { some: { diagram_type_id: { in: realIds } } } },
        { work_diagram_active_novelties: { none: {} } },
      ];
    } else if (hasNull) {
      activeNoveltiesFilter.work_diagram_active_novelties = { none: {} };
    } else {
      activeNoveltiesFilter.work_diagram_active_novelties = { some: { diagram_type_id: { in: realIds } } };
    }
  }

  // Filtros de texto libre por columna individual
  const textFiltersWhere = buildTextFiltersWhere(state.filters, ['name']);

  // Días de trabajo/descanso: columnas Decimal, no admiten `contains` — se filtra por igualdad numérica
  const numericFilters: Record<string, unknown> = {};
  for (const column of ['active_working_days', 'inactive_working_days'] as const) {
    const raw = state.filters[column]?.[0]?.trim().replace(',', '.');
    if (raw) {
      const parsed = Number(raw);
      // Un texto que no es número no puede coincidir con ninguna fila: se fuerza a "sin resultados"
      numericFilters[column] = Number.isFinite(parsed) ? parsed : { in: [] };
    }
  }

  // Filtros de rango de fecha
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, ['created_at']);

  return {
    // Varios filtros pueden traer un OR (búsqueda, estado, novedades): van en AND para que no se pisen.
    AND: [searchWhere, isActiveFilter, inactiveNoveltyFilter, activeNoveltiesFilter],
    ...numericFilters,
    ...textFiltersWhere,
    ...dateFiltersWhere,
  };
}

// ============================================================================
// QUERY PAGINADA
// ============================================================================

export async function getWorkDiagramsPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('listado', 'view');
  try {
    const state = parseState(searchParams);
    const { skip, take } = stateToPrismaParams(state);

    const where = withCompany(buildWhereClause(state), await getActiveCompanyId());

    // Multi-sort: iterar state.sorting (array), NO state.sortBy (patrón viejo)
    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    // Inactivos siempre al final, luego orden del usuario, luego nombre como fallback
    const safeOrderBy = [{ is_active: 'desc' as const }, ...resolvedSorts, { name: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.work_diagram.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: LIST_SELECT,
      }),
      prisma.work_diagram.count({ where }),
    ]);

    return { data: data.map(serializeDiagram), total };
  } catch (error) {
    logger.error('Error al obtener diagramas de trabajo', { data: { error } });
    throw new Error('No se pudo obtener la lista. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT COMPLETO — sin skip/take, mismos filtros
// ============================================================================

export async function getAllWorkDiagramsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<WorkDiagramListItem[]>> {
  await requireConfigTabPermission('listado', 'view');
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
      listIds: (take) => prisma.work_diagram.findMany({ where, orderBy: safeOrderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.work_diagram.findMany({ where: { id: { in: ids }, company_id: companyId }, select: LIST_SELECT }),
      tooLargeMessage: catalogTooLargeMessage('diagramas de trabajo'),
    });
    return { ok: true, data: rows.map(serializeDiagram) };
  } catch (error) {
    logger.error('Error al exportar diagramas de trabajo', { data: { error } });
    return catalogExportFailure(error, 'la lista de diagramas de trabajo');
  }
}

// ============================================================================
// SINGLE FACET — lazy-load on-demand por columna con cross-filtering
// ============================================================================

/**
 * Retorna counts + opciones para UNA sola columna.
 * Aplica TODOS los filtros activos EXCEPTO el de la propia columna (cross-filter).
 */
export async function getWorkDiagramSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResult | null> {
  await requireConfigTabPermission('listado', 'view');
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
        const rows = await prisma.work_diagram.groupBy({
          by: ['is_active'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          const key = r.is_active === null ? NULL_FILTER_VALUE : String(r.is_active);
          counts.set(key, r._count);
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

      case 'inactive_novelty': {
        // Ronda 1: groupBy para IDs con counts
        const rows = await prisma.work_diagram.groupBy({
          by: ['inactive_novelty'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        const ids: string[] = [];
        for (const r of rows) {
          if (r.inactive_novelty === null) {
            counts.set(NULL_FILTER_VALUE, r._count);
          } else {
            counts.set(r.inactive_novelty, r._count);
            ids.push(r.inactive_novelty);
          }
        }

        // Ronda 2: resolver nombres solo para IDs con datos
        const diagramTypes =
          ids.length > 0
            ? await prisma.diagram_type.findMany({
                where: withCompany({ id: { in: ids } }, await getActiveCompanyId()),
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
              })
            : [];

        const options = diagramTypes.map((dt) => ({
          value: dt.id,
          label: dt.name ?? '—',
        }));

        if (counts.has(NULL_FILTER_VALUE)) {
          options.push({ value: NULL_FILTER_VALUE, label: 'Sin asignar' });
        }

        return { options, counts };
      }

      case 'active_novelties': {
        // M:M facet: contar cuántos work_diagrams tienen cada diagram_type como novedad activa
        const rows = await prisma.work_diagram_active_novelties.groupBy({
          by: ['diagram_type_id'],
          where: {
            work_diagram: crossWhere,
          },
          _count: true,
        });

        const counts = new Map<string, number>();
        const ids: string[] = [];
        for (const r of rows) {
          counts.set(r.diagram_type_id, r._count);
          ids.push(r.diagram_type_id);
        }

        const diagramTypes =
          ids.length > 0
            ? await prisma.diagram_type.findMany({
                where: withCompany({ id: { in: ids } }, await getActiveCompanyId()),
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
              })
            : [];

        const options = diagramTypes.map((dt) => ({
          value: dt.id,
          label: dt.name ?? '—',
        }));

        // Diagramas sin ninguna novedad activa
        const withoutNovelties = await prisma.work_diagram.count({
          where: { AND: [crossWhere, { work_diagram_active_novelties: { none: {} } }] },
        });
        if (withoutNovelties > 0) {
          counts.set(NULL_FILTER_VALUE, withoutNovelties);
        }

        return { options, counts };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener faceta de diagrama de trabajo', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// DIAGRAM TYPES — catálogo para el formulario
// ============================================================================

/**
 * Obtiene todos los tipos de diagrama para poblar los selects del formulario.
 */
export async function getAllDiagramTypes() {
  await requireConfigTabPermission('listado', 'view');
  try {
    const companyId = await getActiveCompanyId();
    return await prisma.diagram_type.findMany({
      where: withCompany({}, companyId),
      select: { id: true, name: true, work_active: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener tipos de diagrama', { data: { error } });
    throw new Error('No se pudo obtener los tipos de diagrama.');
  }
}

// ============================================================================
// MUTACIONES — crear y actualizar con Prisma
// ============================================================================

/** Payload común de alta/edición de un diagrama de trabajo. */
export type WorkDiagramInput = {
  name: string;
  is_active: boolean;
  active_working_days: number;
  inactive_working_days: number;
  /** Ids de `diagram_type` que componen las novedades activas (M:M). */
  active_novelty: string[];
  /** Id de `diagram_type` de la novedad inactiva, o cadena vacía si no se eligió. */
  inactive_novelty: string;
};

/** Los días son `Decimal` en Prisma: se serializan a number para cruzar a Client Components. */
function serializeWorkDiagram<T extends { active_working_days: unknown; inactive_working_days: unknown }>(
  row: T
): Omit<T, 'active_working_days' | 'inactive_working_days'> & {
  active_working_days: number | null;
  inactive_working_days: number | null;
} {
  return {
    ...row,
    active_working_days: row.active_working_days !== null ? Number(row.active_working_days) : null,
    inactive_working_days: row.inactive_working_days !== null ? Number(row.inactive_working_days) : null,
  };
}

const workDiagramSelect = {
  id: true,
  name: true,
  is_active: true,
  active_working_days: true,
  inactive_working_days: true,
  inactive_novelty: true,
  created_at: true,
  work_diagram_active_novelties: {
    select: { id: true, diagram_type: { select: { id: true, name: true } } },
  },
} as const;

/** Verifica que todos los `diagram_type` referenciados sean de la empresa activa. */
async function assertDiagramTypesOwned(companyId: string, ids: string[]): Promise<void> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return;
  const found = await prisma.diagram_type.count({ where: withCompany({ id: { in: unique } }, companyId) });
  if (found !== unique.length) throw new Error('Tipo de novedad no encontrado');
}

export async function createWorkDiagramPrisma(input: WorkDiagramInput) {
  await requireConfigTabPermission('listado', 'create');
  input = workDiagramCreateSchema.parse(input);
  try {
    const companyId = await getActiveCompanyId();
    const inactiveNovelty = input.inactive_novelty || null;
    await assertDiagramTypesOwned(companyId, [...input.active_novelty, ...(inactiveNovelty ? [inactiveNovelty] : [])]);

    const result = await prisma.work_diagram.create({
      data: {
        name: input.name,
        is_active: input.is_active,
        active_working_days: input.active_working_days,
        inactive_working_days: input.inactive_working_days,
        inactive_novelty: inactiveNovelty,
        company_id: companyId,
        work_diagram_active_novelties: {
          create: input.active_novelty.map((diagramTypeId) => ({
            diagram_type_id: diagramTypeId,
            company_id: companyId,
          })),
        },
      },
      select: workDiagramSelect,
    });
    return serializeWorkDiagram(result);
  } catch (error) {
    logger.error('Error al crear diagrama de trabajo', { data: { error } });
    throw new Error('No se pudo crear el diagrama. Intente nuevamente.');
  }
}

/** Payload de edición: las novedades activas viajan como altas y bajas explícitas, nunca como conjunto final. */
export type WorkDiagramUpdateInput = Omit<WorkDiagramInput, 'active_novelty'> & {
  id: string;
  active_novelty: { add: string[]; remove: string[] };
};

const workDiagramUpdateWithDeltaSchema = workDiagramUpdateSchema.omit({ active_novelty: true }).extend({
  active_novelty: z.object({
    add: z.array(z.string().uuid('Identificador inválido')).max(500, 'Demasiados elementos'),
    remove: z.array(z.string().uuid('Identificador inválido')).max(500, 'Demasiados elementos'),
  }),
});

/**
 * Ids de las novedades activas (`diagram_type`) que tiene hoy el diagrama, leídos de la pivote.
 * Es el baseline del formulario de edición: el delta se calcula contra esto, no contra la fila de la tabla.
 */
export async function getWorkDiagramActiveNoveltyIds(diagramId: string): Promise<string[]> {
  await requireConfigTabPermission('listado', 'view');
  const id = z.string().uuid('Identificador inválido').parse(diagramId);
  try {
    const companyId = await getActiveCompanyId();
    const rows = await prisma.work_diagram_active_novelties.findMany({
      where: withCompany({ work_diagram_id: id }, companyId),
      select: { diagram_type_id: true },
    });
    return rows.map((row) => row.diagram_type_id);
  } catch (error) {
    logger.error('Error al obtener novedades activas del diagrama', { data: { error, diagramId } });
    throw new Error('No se pudieron obtener las novedades activas del diagrama.');
  }
}

export async function updateWorkDiagramPrisma(data: WorkDiagramUpdateInput) {
  await requireConfigTabPermission('listado', 'update');
  const input = workDiagramUpdateWithDeltaSchema.parse(data);
  const { add, remove } = input.active_novelty;
  if (add.some((id) => remove.includes(id))) throw new Error('Una novedad no puede agregarse y quitarse a la vez');
  try {
    const companyId = await getActiveCompanyId();
    // Perímetro sin RLS: sólo se edita un diagrama de la empresa activa.
    const owned = await prisma.work_diagram.findFirst({
      where: withCompany({ id: input.id }, companyId),
      select: { id: true },
    });
    if (!owned) throw new Error('Diagrama no encontrado');

    const inactiveNovelty = input.inactive_novelty || null;
    await assertDiagramTypesOwned(companyId, [...add, ...(inactiveNovelty ? [inactiveNovelty] : [])]);

    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.work_diagram.update({
        where: { id: input.id },
        data: {
          name: input.name,
          is_active: input.is_active,
          active_working_days: input.active_working_days,
          inactive_working_days: input.inactive_working_days,
          inactive_novelty: inactiveNovelty,
        },
        select: workDiagramSelect,
      });
      const removed =
        remove.length > 0
          ? (
              await tx.work_diagram_active_novelties.deleteMany({
                where: { work_diagram_id: input.id, diagram_type_id: { in: remove } },
              })
            ).count
          : 0;
      const added =
        add.length > 0
          ? (
              await tx.work_diagram_active_novelties.createMany({
                data: add.map((diagramTypeId) => ({
                  work_diagram_id: input.id,
                  diagram_type_id: diagramTypeId,
                  company_id: companyId,
                })),
                skipDuplicates: true,
              })
            ).count
          : 0;
      return { row, added, removed };
    });
    return { ...serializeWorkDiagram(result.row), added: result.added, removed: result.removed };
  } catch (error) {
    logger.error('Error al actualizar diagrama de trabajo', { data: { error } });
    throw new Error('No se pudo actualizar el diagrama. Intente nuevamente.');
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type WorkDiagramListItem = Awaited<ReturnType<typeof getWorkDiagramsPaginated>>['data'][number];
export type DiagramTypeItem = Awaited<ReturnType<typeof getAllDiagramTypes>>[number];
