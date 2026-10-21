'use server';

import { Logger } from '@/lib/logger';
import type { DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable';
import {
  NULL_FILTER_VALUE,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import { fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { sanitizeFilters } from '@/shared/lib/table-filters';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { z } from 'zod';
import { aptitudeCreateSchema, aptitudeUpdateSchema } from '../../lib/catalog-input-schemas';
import {
  CATALOG_EXPORT_MAX_ROWS,
  buildIsActiveWhere,
  catalogExportFailure,
  catalogTooLargeMessage,
} from '../../lib/catalog-table.server';
import { requireConfigTabPermission } from '../../lib/config-access.server';
import { assertPositionsOwned } from '../lib/catalog-guards';

// ============================================================================
// LOGGER
// ============================================================================

const logger = new Logger('features/Empresa/RRHH/AptitudesTecnicas');

// ============================================================================
// VALID SORT FIELDS — solo campos reales de BD en aptitudes_tecnicas
// ============================================================================

const VALID_SORT_FIELDS = new Set(['nombre', 'is_active']);

// ============================================================================
// SELECT reutilizable — 1 sola query con include (no 3 roundtrips)
// ============================================================================

const aptitudSelect = {
  id: true,
  nombre: true,
  is_active: true,
  aptitudes_tecnicas_puestos: {
    select: {
      puesto_id: true,
      created_at: true,
      company_positions: {
        select: { id: true, name: true },
      },
    },
  },
} as const;

// ============================================================================
// WHERE BUILDER — DRY helper compartido por paginated, export y facets
// ============================================================================

/** Claves de filtro que esta tabla realmente usa; el resto de la URL se descarta antes de armar el where. */
const ALLOWED_FILTER_KEYS = new Set(['is_active', 'puestos', 'nombre']);

function parseState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);
}

function buildWhereClause(state: ReturnType<typeof parseState>) {
  // Búsqueda global por nombre
  const searchWhere = buildSearchWhere(state.search, ['nombre']);

  // is_active (booleano nullable): 'true' / 'false' / NULL_FILTER_VALUE
  const isActiveFilter = buildIsActiveWhere(state.filters['is_active']);

  // Filtro de texto libre por columna "nombre"
  const textFiltersWhere = buildTextFiltersWhere(state.filters, ['nombre']);

  // puestos — M:M: aptitudes asignadas a alguno de los puestos elegidos, o a ninguno
  const puestosValues = state.filters['puestos'];
  const puestosFilter: Record<string, unknown> = {};
  if (puestosValues && puestosValues.length > 0) {
    const realIds = puestosValues.filter((v) => v !== NULL_FILTER_VALUE);
    const hasNull = puestosValues.includes(NULL_FILTER_VALUE);
    if (hasNull && realIds.length > 0) {
      puestosFilter.OR = [
        { aptitudes_tecnicas_puestos: { some: { puesto_id: { in: realIds } } } },
        { aptitudes_tecnicas_puestos: { none: {} } },
      ];
    } else if (hasNull) {
      puestosFilter.aptitudes_tecnicas_puestos = { none: {} };
    } else {
      puestosFilter.aptitudes_tecnicas_puestos = { some: { puesto_id: { in: realIds } } };
    }
  }

  return {
    // La búsqueda, el estado y los puestos pueden traer un OR cada uno: van en AND para que no se pisen.
    AND: [searchWhere, isActiveFilter, puestosFilter],
    ...textFiltersWhere,
  };
}

// ============================================================================
// QUERY PAGINADA
// ============================================================================

export async function getAptitudesTecnicasPaginated(searchParams: DataTableSearchParams) {
  await requireConfigTabPermission('aptitudes', 'view');
  try {
    const state = parseState(searchParams);
    const { skip, take } = stateToPrismaParams(state);

    const where = withCompany(buildWhereClause(state), await getActiveCompanyId());

    // Multi-sort
    const resolvedSorts: Array<Record<string, unknown>> = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    // Inactivos siempre al final
    const safeOrderBy = [{ is_active: 'desc' as const }, ...resolvedSorts, { nombre: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.aptitudes_tecnicas.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: aptitudSelect,
      }),
      prisma.aptitudes_tecnicas.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener aptitudes técnicas', { data: { error } });
    throw new Error('No se pudo obtener la lista. Intente nuevamente.');
  }
}

// ============================================================================
// EXPORT COMPLETO — sin skip/take, mismos filtros
// ============================================================================

export async function getAllAptitudesTecnicasForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<AptitudTecnicaListItem[]>> {
  await requireConfigTabPermission('aptitudes', 'view');
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
      { nombre: 'asc' as const },
      { id: 'asc' as const },
    ];

    const rows = await fetchExportRowsInBatches({
      maxRows: CATALOG_EXPORT_MAX_ROWS,
      listIds: (take) =>
        prisma.aptitudes_tecnicas.findMany({ where, orderBy: safeOrderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.aptitudes_tecnicas.findMany({
          where: { id: { in: ids }, company_id: companyId },
          select: aptitudSelect,
        }),
      tooLargeMessage: catalogTooLargeMessage('aptitudes técnicas'),
    });
    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar aptitudes técnicas', { data: { error } });
    return catalogExportFailure(error, 'la lista de aptitudes técnicas');
  }
}

// ============================================================================
// SINGLE FACET — lazy-load on-demand por columna con cross-filtering
// ============================================================================

export async function getAptitudesTecnicasSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResult | null> {
  await requireConfigTabPermission('aptitudes', 'view');
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
        const rows = await prisma.aptitudes_tecnicas.groupBy({
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

      case 'puestos': {
        // Cuántas aptitudes tiene cada puesto y cuántas no tienen ninguno asignado
        const rows = await prisma.aptitudes_tecnicas_puestos.groupBy({
          by: ['puesto_id'],
          where: { aptitudes_tecnicas: crossWhere },
          _count: true,
        });

        const counts = new Map<string, number>();
        for (const r of rows) counts.set(r.puesto_id, r._count);

        const withoutPositions = await prisma.aptitudes_tecnicas.count({
          where: { AND: [crossWhere, { aptitudes_tecnicas_puestos: { none: {} } }] },
        });
        if (withoutPositions > 0) counts.set(NULL_FILTER_VALUE, withoutPositions);

        const positions = await prisma.company_positions.findMany({
          where: withCompany({ id: { in: rows.map((r) => r.puesto_id) } }, await getActiveCompanyId()),
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });

        return {
          options: positions.map((p) => ({ value: p.id, label: p.name ?? '—' })),
          counts,
        };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener faceta de aptitud técnica', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// OBTENER PUESTOS ACTIVOS — para el formulario (selector)
// ============================================================================

export async function getActiveCompanyPositions() {
  await requireConfigTabPermission('aptitudes', 'view');
  try {
    const companyId = await getActiveCompanyId();
    return await prisma.company_positions.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener puestos de trabajo', { data: { error } });
    return [];
  }
}

// ============================================================================
// MUTACIONES — crear y actualizar con Prisma
// ============================================================================

export async function createAptitudTecnicaPrisma(data: { nombre: string; puestos: string[]; is_active: boolean }) {
  await requireConfigTabPermission('aptitudes', 'create');
  data = aptitudeCreateSchema.parse(data);
  try {
    const companyId = await getActiveCompanyId();
    // Los puestos llegan del cliente: se validan contra la empresa antes de escribir la pivote.
    await assertPositionsOwned(companyId, data.puestos);

    const result = await prisma.aptitudes_tecnicas.create({
      data: {
        nombre: data.nombre,
        is_active: data.is_active,
        aptitudes_tecnicas_puestos: {
          create: data.puestos.map((puestoId) => ({ puesto_id: puestoId })),
        },
      },
      select: aptitudSelect,
    });
    return result;
  } catch (error) {
    logger.error('Error al crear aptitud técnica', { data: { error } });
    throw error instanceof Error ? error : new Error('No se pudo crear la aptitud técnica. Intente nuevamente.');
  }
}

/** Altas y bajas explícitas de puestos de la aptitud: la ausencia de un id nunca implica baja. */
const aptitudeUpdateWithDeltaSchema = aptitudeUpdateSchema.omit({ puestos: true }).extend({
  puestos: z.object({
    add: z.array(z.string().uuid('Identificador inválido')).max(500, 'Demasiados elementos'),
    remove: z.array(z.string().uuid('Identificador inválido')).max(500, 'Demasiados elementos'),
  }),
});

/**
 * Ids de los puestos que tienen hoy la aptitud, leídos de la pivote.
 * Es el baseline del formulario de edición: el delta se calcula contra esto, no contra la fila de la tabla.
 */
export async function getAptitudePositionIds(aptitudeId: string): Promise<string[]> {
  await requireConfigTabPermission('aptitudes', 'view');
  const id = z.string().uuid('Identificador inválido').parse(aptitudeId);
  try {
    const companyId = await getActiveCompanyId();
    const rows = await prisma.aptitudes_tecnicas_puestos.findMany({
      where: { aptitud_id: id, aptitudes_tecnicas: withCompany({}, companyId) },
      select: { puesto_id: true },
    });
    return rows.map((row) => row.puesto_id);
  } catch (error) {
    logger.error('Error al obtener puestos de la aptitud', { data: { error, aptitudeId } });
    throw new Error('No se pudieron obtener los puestos de la aptitud.');
  }
}

export async function updateAptitudTecnicaPrisma(data: {
  id: string;
  nombre: string;
  puestos: { add: string[]; remove: string[] };
  is_active: boolean;
}) {
  await requireConfigTabPermission('aptitudes', 'update');
  const input = aptitudeUpdateWithDeltaSchema.parse(data);
  const { add, remove } = input.puestos;
  if (add.some((id) => remove.includes(id))) throw new Error('Un puesto no puede agregarse y quitarse a la vez');
  try {
    // Perímetro sin RLS: la aptitud tiene que ser de la empresa activa antes de escribirla.
    const companyId = await getActiveCompanyId();
    const owned = await prisma.aptitudes_tecnicas.findFirst({
      where: withCompany({ id: input.id }, companyId),
      select: { id: true },
    });
    if (!owned) throw new Error('Aptitud técnica no encontrada');

    // Los puestos a agregar llegan del cliente: se validan contra la empresa antes de escribir la pivote.
    await assertPositionsOwned(companyId, add);

    // Una sola transacción: datos de la aptitud + bajas y altas explícitas de la pivote.
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.aptitudes_tecnicas.update({
        where: { id: input.id },
        data: { nombre: input.nombre, is_active: input.is_active },
        select: { id: true },
      });
      const removed =
        remove.length > 0
          ? (
              await tx.aptitudes_tecnicas_puestos.deleteMany({
                where: { aptitud_id: input.id, puesto_id: { in: remove } },
              })
            ).count
          : 0;
      const added =
        add.length > 0
          ? (
              await tx.aptitudes_tecnicas_puestos.createMany({
                data: add.map((puestoId) => ({ aptitud_id: input.id, puesto_id: puestoId })),
                skipDuplicates: true,
              })
            ).count
          : 0;
      return { row, added, removed };
    });

    return { ...result.row, added: result.added, removed: result.removed };
  } catch (error) {
    logger.error('Error al actualizar aptitud técnica', { data: { error } });
    throw error instanceof Error ? error : new Error('No se pudo actualizar la aptitud técnica. Intente nuevamente.');
  }
}

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type AptitudTecnicaListItem = Awaited<ReturnType<typeof getAptitudesTecnicasPaginated>>['data'][number];

export type CompanyPositionOption = Awaited<ReturnType<typeof getActiveCompanyPositions>>[number];
