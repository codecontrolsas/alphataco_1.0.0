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
import { positionCreateSchema, positionUpdateSchema } from '../../lib/catalog-input-schemas';
import {
  CATALOG_EXPORT_MAX_ROWS,
  buildIsActiveWhere,
  catalogExportFailure,
  catalogTooLargeMessage,
} from '../../lib/catalog-table.server';
import { requireConfigTabPermission } from '../../lib/config-access.server';
import { assertAptitudesOwned, assertHierarchiesOwned } from '../lib/catalog-guards';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('features/Empresa/RRHH/Positions');

// ============================================================================
// VALID SORT FIELDS — solo campos reales de BD (no virtuales)
// ============================================================================

const LIST_SELECT = {
  id: true,
  name: true,
  is_active: true,
  created_at: true,
  hierarchical_position_id: true, // array de UUIDs de hierarchy
  aptitudes_tecnicas_puestos: {
    include: {
      aptitudes_tecnicas: {
        select: { id: true, nombre: true },
      },
    },
  },
} as const;

const VALID_SORT_FIELDS = new Set(['name', 'is_active', 'created_at']);

// ============================================================================
// WHERE BUILDER — DRY helper compartido por paginated, export y facets
// ============================================================================

/** Claves de filtro que esta tabla realmente usa; el resto de la URL se descarta antes de armar el where. */
const ALLOWED_FILTER_KEYS = new Set(['is_active', 'aptitudes', 'hierarchy', 'name', ...dateRangeKeys(['created_at'])]);

function parseState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);
}

/** Filtro M:M por id relacionado: `some` para los valores reales, `none` para "sin ninguno", OR si vienen ambos. */
function buildManyToManyWhere(relation: string, relatedKey: string, values: string[] | undefined) {
  if (!values || values.length === 0) return {};
  const realIds = values.filter((v) => v !== NULL_FILTER_VALUE);
  const hasNull = values.includes(NULL_FILTER_VALUE);
  if (hasNull && realIds.length > 0) {
    return { OR: [{ [relation]: { some: { [relatedKey]: { in: realIds } } } }, { [relation]: { none: {} } }] };
  }
  if (hasNull) return { [relation]: { none: {} } };
  return { [relation]: { some: { [relatedKey]: { in: realIds } } } };
}

function buildWhereClause(state: ReturnType<typeof parseState>) {
  // Búsqueda global: name
  const searchWhere = buildSearchWhere(state.search, ['name']);

  // is_active (booleano nullable): 'true' / 'false' / NULL_FILTER_VALUE
  const isActiveFilter = buildIsActiveWhere(state.filters['is_active']);

  // aptitudes — filtro M:M: si se seleccionan aptitudes, filtrar puestos que las tengan
  const aptitudesFilter = buildManyToManyWhere('aptitudes_tecnicas_puestos', 'aptitud_id', state.filters['aptitudes']);

  // hierarchy — array de UUIDs (hierarchical_position_id): hasSome / isEmpty
  const hierarchyValues = state.filters['hierarchy'];
  const hierarchyFilter: Record<string, unknown> = {};
  if (hierarchyValues && hierarchyValues.length > 0) {
    const realIds = hierarchyValues.filter((v) => v !== NULL_FILTER_VALUE);
    const hasNull = hierarchyValues.includes(NULL_FILTER_VALUE);
    if (hasNull && realIds.length > 0) {
      hierarchyFilter.OR = [
        { hierarchical_position_id: { hasSome: realIds } },
        { hierarchical_position_id: { isEmpty: true } },
      ];
    } else if (hasNull) {
      hierarchyFilter.hierarchical_position_id = { isEmpty: true };
    } else {
      hierarchyFilter.hierarchical_position_id = { hasSome: realIds };
    }
  }

  // Filtros de texto libre por columna
  const textFiltersWhere = buildTextFiltersWhere(state.filters, ['name']);

  // Filtros de rango de fecha
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, ['created_at']);

  return {
    // Varios de estos filtros pueden traer un OR: van en AND para que no se pisen entre sí.
    AND: [searchWhere, isActiveFilter, aptitudesFilter, hierarchyFilter],
    ...textFiltersWhere,
    ...dateFiltersWhere,
  };
}

// ============================================================================
// QUERY PAGINADA
// ============================================================================

/** Agrega `hierarchyNames` (nombres de los sectores) a cada puesto, resolviéndolos en UNA consulta acotada a la empresa. */
async function withHierarchyNames<Row extends { hierarchical_position_id: string[] }>(rows: Row[], companyId: string) {
  const allHierarchyIds = [...new Set(rows.flatMap((p) => p.hierarchical_position_id))];
  const hierarchyMap = new Map<string, string>();

  if (allHierarchyIds.length > 0) {
    const hierarchies = await prisma.hierarchy.findMany({
      where: withCompany({ id: { in: allHierarchyIds } }, companyId),
      select: { id: true, name: true },
    });
    for (const h of hierarchies) {
      hierarchyMap.set(h.id, h.name);
    }
  }

  return rows.map((pos) => ({
    ...pos,
    hierarchyNames: pos.hierarchical_position_id.map((id) => hierarchyMap.get(id) ?? id),
  }));
}

export async function getPositionsPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('positions', 'view');
  try {
    const state = parseState(searchParams);
    const { skip, take } = stateToPrismaParams(state);

    const companyId = await getActiveCompanyId();
    const where = withCompany(buildWhereClause(state), companyId);

    // Multi-sort
    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    // Inactivos siempre al final
    const safeOrderBy = [{ is_active: 'desc' as const }, ...resolvedSorts, { name: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.company_positions.findMany({ skip, take, orderBy: safeOrderBy, where, select: LIST_SELECT }),
      prisma.company_positions.count({ where }),
    ]);

    return { data: await withHierarchyNames(data, companyId), total };
  } catch (error) {
    logger.error('Error al obtener puestos', { data: { error } });
    throw new Error('No se pudo obtener la lista de puestos. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT COMPLETO — sin skip/take, mismos filtros, tope de filas
// ============================================================================

export async function getAllPositionsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<PositionListItem[]>> {
  await requireConfigTabPermission('positions', 'view');
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
      listIds: (take) => prisma.company_positions.findMany({ where, orderBy: safeOrderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.company_positions.findMany({ where: { id: { in: ids }, company_id: companyId }, select: LIST_SELECT }),
      tooLargeMessage: catalogTooLargeMessage('puestos'),
    });
    return { ok: true, data: await withHierarchyNames(rows, companyId) };
  } catch (error) {
    logger.error('Error al exportar puestos', { data: { error } });
    return catalogExportFailure(error, 'la lista de puestos');
  }
}

// ============================================================================
// SINGLE FACET — lazy-load on-demand por columna con cross-filtering
// ============================================================================

/**
 * Retorna counts + opciones para UNA sola columna.
 * Aplica TODOS los filtros activos EXCEPTO el de la propia columna (cross-filter).
 */
export async function getPositionSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResult | null> {
  await requireConfigTabPermission('positions', 'view');
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
        const rows = await prisma.company_positions.groupBy({
          by: ['is_active'],
          where: crossWhere,
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) {
          if (r.is_active === null) {
            counts.set(NULL_FILTER_VALUE, r._count);
          } else {
            counts.set(String(r.is_active), r._count);
          }
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

      case 'hierarchy': {
        // Cuántos puestos tiene cada sector (array de UUIDs) y cuántos no tienen ninguno
        const positions = await prisma.company_positions.findMany({
          where: crossWhere,
          select: { hierarchical_position_id: true },
        });

        let nullCount = 0;
        const hierarchyCounts = new Map<string, number>();
        for (const pos of positions) {
          if (pos.hierarchical_position_id.length === 0) {
            nullCount++;
            continue;
          }
          for (const id of pos.hierarchical_position_id) {
            hierarchyCounts.set(id, (hierarchyCounts.get(id) ?? 0) + 1);
          }
        }
        if (nullCount > 0) hierarchyCounts.set(NULL_FILTER_VALUE, nullCount);

        const hierarchies = await prisma.hierarchy.findMany({
          where: withCompany(
            { id: { in: [...hierarchyCounts.keys()].filter((k) => k !== NULL_FILTER_VALUE) } },
            await getActiveCompanyId()
          ),
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });

        return {
          options: hierarchies.map((h) => ({ value: h.id, label: h.name })),
          counts: hierarchyCounts,
        };
      }

      case 'aptitudes': {
        // Obtener todos los puestos con sus aptitudes (respetando crossWhere)
        const positions = await prisma.company_positions.findMany({
          where: crossWhere,
          select: {
            aptitudes_tecnicas_puestos: {
              select: { aptitud_id: true },
            },
          },
        });

        // Contar puestos sin aptitudes
        let nullCount = 0;
        const aptitudCounts = new Map<string, number>();

        for (const pos of positions) {
          if (pos.aptitudes_tecnicas_puestos.length === 0) {
            nullCount++;
          } else {
            for (const rel of pos.aptitudes_tecnicas_puestos) {
              aptitudCounts.set(rel.aptitud_id, (aptitudCounts.get(rel.aptitud_id) ?? 0) + 1);
            }
          }
        }

        if (nullCount > 0) {
          aptitudCounts.set(NULL_FILTER_VALUE, nullCount);
        }

        // Resolver nombres de aptitudes
        const aptitudIds = [...aptitudCounts.keys()].filter((k) => k !== NULL_FILTER_VALUE);
        const aptitudes = await prisma.aptitudes_tecnicas.findMany({
          where: withCompany({ id: { in: aptitudIds } }, await getActiveCompanyId()),
          select: { id: true, nombre: true },
          orderBy: { nombre: 'asc' },
        });

        const resolvedOptions = aptitudes.map((apt) => ({
          value: apt.id,
          label: apt.nombre,
        }));

        return {
          options: resolvedOptions,
          counts: aptitudCounts,
        };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener faceta de puesto', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// CATÁLOGOS para el formulario
// ============================================================================

export async function getAllHierarchiesForForm() {
  await requireConfigTabPermission('positions', 'view');
  try {
    const companyId = await getActiveCompanyId();
    const data = await prisma.hierarchy.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return data;
  } catch (error) {
    logger.error('Error al obtener jerarquías', { data: { error } });
    throw new Error('No se pudo obtener las jerarquías.');
  }
}

export async function getAllAptitudesForForm() {
  await requireConfigTabPermission('positions', 'view');
  try {
    const companyId = await getActiveCompanyId();
    const data = await prisma.aptitudes_tecnicas.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    });
    return data;
  } catch (error) {
    logger.error('Error al obtener aptitudes técnicas', { data: { error } });
    throw new Error('No se pudo obtener las aptitudes técnicas.');
  }
}

// ============================================================================
// MUTACIONES — crear y actualizar con Prisma
// ============================================================================

export async function createPositionPrisma(data: {
  name: string;
  is_active: boolean;
  hierarchical_position_id: string[];
  aptitudes_tecnicas_id: string[];
}) {
  await requireConfigTabPermission('positions', 'create');
  data = positionCreateSchema.parse(data);
  try {
    const companyId = await getActiveCompanyId();
    // Jerarquías y aptitudes llegan del cliente: se validan contra la empresa antes de escribir.
    await Promise.all([
      assertHierarchiesOwned(companyId, data.hierarchical_position_id),
      assertAptitudesOwned(companyId, data.aptitudes_tecnicas_id),
    ]);

    const position = await prisma.company_positions.create({
      data: {
        name: data.name,
        is_active: data.is_active,
        hierarchical_position_id: data.hierarchical_position_id,
        ...(data.aptitudes_tecnicas_id.length > 0
          ? {
              aptitudes_tecnicas_puestos: {
                create: data.aptitudes_tecnicas_id.map((aptitudId) => ({
                  aptitud_id: aptitudId,
                })),
              },
            }
          : {}),
      },
      select: { id: true, name: true },
    });
    return position;
  } catch (error) {
    logger.error('Error al crear puesto', { data: { error } });
    throw error instanceof Error ? error : new Error('No se pudo crear el puesto. Intente nuevamente.');
  }
}

/** Altas y bajas explícitas de aptitudes del puesto: la ausencia de un id nunca implica baja. */
const positionUpdateWithDeltaSchema = positionUpdateSchema.omit({ aptitudes_tecnicas_id: true }).extend({
  aptitudes: z.object({
    add: z.array(z.string().uuid('Identificador inválido')).max(500, 'Demasiados elementos'),
    remove: z.array(z.string().uuid('Identificador inválido')).max(500, 'Demasiados elementos'),
  }),
});

/**
 * Ids de las aptitudes técnicas que tiene hoy el puesto, leídos de la pivote.
 * Es el baseline del formulario de edición: el delta se calcula contra esto, no contra la fila de la tabla.
 */
export async function getPositionAptitudeIds(positionId: string): Promise<string[]> {
  await requireConfigTabPermission('positions', 'view');
  const id = z.string().uuid('Identificador inválido').parse(positionId);
  try {
    const companyId = await getActiveCompanyId();
    const rows = await prisma.aptitudes_tecnicas_puestos.findMany({
      where: { puesto_id: id, company_positions: withCompany({}, companyId) },
      select: { aptitud_id: true },
    });
    return rows.map((row) => row.aptitud_id);
  } catch (error) {
    logger.error('Error al obtener aptitudes del puesto', { data: { error, positionId } });
    throw new Error('No se pudieron obtener las aptitudes del puesto.');
  }
}

export async function updatePositionPrisma(data: {
  id: string;
  name: string;
  is_active: boolean;
  hierarchical_position_id: string[];
  aptitudes: { add: string[]; remove: string[] };
}) {
  await requireConfigTabPermission('positions', 'update');
  const input = positionUpdateWithDeltaSchema.parse(data);
  const { add, remove } = input.aptitudes;
  if (add.some((id) => remove.includes(id))) throw new Error('Una aptitud no puede agregarse y quitarse a la vez');
  try {
    // Perímetro sin RLS: el puesto tiene que ser de la empresa activa antes de escribirlo.
    const companyId = await getActiveCompanyId();
    const owned = await prisma.company_positions.findFirst({
      where: withCompany({ id: input.id }, companyId),
      select: { id: true },
    });
    if (!owned) throw new Error('Puesto no encontrado');

    // Jerarquías y aptitudes a agregar llegan del cliente: se validan contra la empresa antes de escribir.
    await Promise.all([
      assertHierarchiesOwned(companyId, input.hierarchical_position_id),
      assertAptitudesOwned(companyId, add),
    ]);

    // Una sola transacción: datos del puesto + bajas y altas explícitas de la pivote.
    const result = await prisma.$transaction(async (tx) => {
      await tx.company_positions.update({
        where: { id: input.id },
        data: {
          name: input.name,
          is_active: input.is_active,
          hierarchical_position_id: input.hierarchical_position_id,
        },
      });
      const removed =
        remove.length > 0
          ? (
              await tx.aptitudes_tecnicas_puestos.deleteMany({
                where: { puesto_id: input.id, aptitud_id: { in: remove } },
              })
            ).count
          : 0;
      const added =
        add.length > 0
          ? (
              await tx.aptitudes_tecnicas_puestos.createMany({
                data: add.map((aptitudId) => ({ puesto_id: input.id, aptitud_id: aptitudId })),
                skipDuplicates: true,
              })
            ).count
          : 0;
      return { added, removed };
    });
    return { id: input.id, ...result };
  } catch (error) {
    logger.error('Error al actualizar puesto', { data: { error } });
    throw error instanceof Error ? error : new Error('No se pudo actualizar el puesto. Intente nuevamente.');
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type PositionListItem = Awaited<ReturnType<typeof getPositionsPaginated>>['data'][number];
