'use server';

import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ExportTooLargeError, fetchExportRowsInBatches, tooManyRowsMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import {
  EQUIPMENT_CHECKLIST_TAB,
  EquipmentHistoryAccessError,
  requireEquipmentTabView,
} from '../lib/equipment-history-access';
import { argentinaDateRange, sanitizeUuidFilters, textFilterValue } from '../lib/table-filters';

const logger = new Logger('features/Equipos/EquipoID/checklist-queries');

// ============================================================================
// CONSTANTES
// ============================================================================

/** Tope de filas por página: el DataTable de la ficha ofrece como máximo este tamaño. */
const MAX_PAGE_SIZE = 50;

/** Tope de filas del export a Excel. */
const MAX_EXPORT_ROWS = 10_000;

/** Filtros facetados que se resuelven directo sobre una columna de la respuesta (columnId → campo). */
const COLUMN_MAP: Record<string, string> = { template: 'template_id', result: 'result', performedBy: 'user_id' };

/** Columnas de texto que filtran un campo propio de la respuesta. */
const TEXT_COLUMN_MAP: Record<string, string> = { observations: 'observations' };

/** Columnas cuyo filtro necesita una condición armada a mano. */
const CUSTOM_COLUMNS = ['criticalItems', 'tractorUnit'] as const;

const DATE_RANGE_COLUMNS = ['created_at'] as const;

const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(COLUMN_MAP),
  ...Object.keys(TEXT_COLUMN_MAP),
  ...CUSTOM_COLUMNS,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

type SortDirection = 'asc' | 'desc';

/** Columnas ordenables. "Items críticos fallidos" (lista) y "Unidad tractor" (otra respuesta) no tienen un campo ordenable. */
const SORT_BUILDERS: Record<string, (dir: SortDirection) => Prisma.checklist_answersOrderByWithRelationInput> = {
  created_at: (dir) => ({ created_at: { sort: dir, nulls: 'last' } }),
  template: (dir) => ({ checklist_templates: { name: dir } }),
  result: (dir) => ({ result: { sort: dir, nulls: 'last' } }),
  performedBy: (dir) => ({ profile: { fullname: { sort: dir, nulls: 'last' } } }),
  observations: (dir) => ({ observations: { sort: dir, nulls: 'last' } }),
};

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

function parseChecklistState(searchParams: DataTableSearchParams) {
  const state = sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
  return { ...state, filters: sanitizeUuidFilters(state.filters, ['template', 'performedBy']) };
}

type ChecklistState = ReturnType<typeof parseChecklistState>;

/** "Con ítems críticos fallidos": `true` si la lista no está vacía, `false` si lo está. Ambos valores = sin filtro. */
function buildCriticalItemsWhere(values: string[] | undefined): Prisma.checklist_answersWhereInput {
  const wantsFailed = !!values?.includes('true');
  const wantsClean = !!values?.includes('false');
  if (wantsFailed === wantsClean) return {};
  return wantsFailed
    ? { NOT: { critical_items_failed: { isEmpty: true } } }
    : { critical_items_failed: { isEmpty: true } };
}

/**
 * WHERE compartido entre la página, el export y las facetas. El perímetro (empresa y equipo) va en el mismo
 * `AND` que los filtros: ningún filtro de la URL puede pisarlo.
 */
function buildChecklistWhere(
  companyId: string,
  equipmentId: string,
  state: ChecklistState
): Prisma.checklist_answersWhereInput {
  const { filters } = state;

  const filtersWhere = buildFiltersWhere(filters, COLUMN_MAP, {
    exclude: [...Object.keys(TEXT_COLUMN_MAP), ...CUSTOM_COLUMNS, ...dateRangeKeys(DATE_RANGE_COLUMNS)],
  });
  const textWhere = buildTextFiltersWhere(filters, Object.keys(TEXT_COLUMN_MAP), TEXT_COLUMN_MAP);

  const tractorTerm = textFilterValue(filters, 'tractorUnit');
  const tractorWhere: Prisma.checklist_answersWhereInput = tractorTerm
    ? {
        checklist_answers: {
          vehicles: {
            OR: [
              { domain: { contains: tractorTerm, mode: 'insensitive' } },
              { serie: { contains: tractorTerm, mode: 'insensitive' } },
              { intern_number: { contains: tractorTerm, mode: 'insensitive' } },
            ],
          },
        },
      }
    : {};

  const search = state.search.trim();
  const searchWhere: Prisma.checklist_answersWhereInput = search
    ? {
        OR: [
          buildSearchWhere(search, ['observations']) as Prisma.checklist_answersWhereInput,
          { checklist_templates: { name: { contains: search, mode: 'insensitive' } } },
          { profile: { fullname: { contains: search, mode: 'insensitive' } } },
        ],
      }
    : {};

  const createdAtRange = argentinaDateRange(filters, 'created_at');

  return {
    AND: [
      { company_id: companyId },
      { equipment_id: equipmentId },
      filtersWhere as Prisma.checklist_answersWhereInput,
      textWhere as Prisma.checklist_answersWhereInput,
      buildCriticalItemsWhere(filters.criticalItems),
      tractorWhere,
      searchWhere,
      createdAtRange ? { created_at: createdAtRange } : {},
    ],
  };
}

function buildChecklistOrderBy(state: ChecklistState): Prisma.checklist_answersOrderByWithRelationInput[] {
  const sorts = state.sorting.flatMap((sort) => {
    const builder = SORT_BUILDERS[sort.id];
    return builder ? [builder(sort.desc ? 'desc' : 'asc')] : [];
  });

  // Desempate por id: sin él, el orden entre filas iguales cambia de una página a otra.
  return [...(sorts.length > 0 ? sorts : [SORT_BUILDERS.created_at('desc')]), { id: 'asc' }];
}

const CHECKLIST_ANSWER_SELECT = {
  id: true,
  created_at: true,
  result: true,
  observations: true,
  critical_items_failed: true,
  checklist_templates: { select: { id: true, name: true, description: true } },
  profile: { select: { id: true, fullname: true } },
  // Checklist de la unidad tractora a la que estaba enganchado el equipo
  checklist_answers: {
    select: {
      equipment_id: true,
      vehicles: { select: { id: true, domain: true, serie: true, intern_number: true } },
    },
  },
} satisfies Prisma.checklist_answersSelect;

// ============================================================================
// PÁGINA
// ============================================================================

/**
 * Página de las respuestas de checklist de un equipo (tab "Checklists" de la ficha, flujo logueado), acotada
 * a 50 filas y con las más recientes primero. No trae el `answer_data` de cada respuesta.
 *
 * Lanza si no hay permiso o si la consulta falla: antes devolvía `[]` y la pantalla afirmaba "no hay
 * checklists" cuando en realidad la consulta había fallado.
 */
export async function getEquipmentChecklistsPaginated(equipmentId: string, searchParams: DataTableSearchParams) {
  // Ficha de un equipo nuevo (sin id): vacío legítimo, no una falla.
  if (!equipmentId) return { data: [], total: 0 };

  const companyId = await requireEquipmentTabView(EQUIPMENT_CHECKLIST_TAB, equipmentId);

  try {
    const state = parseChecklistState(searchParams);
    const { skip, take } = clampedPageParams(state, { max: MAX_PAGE_SIZE });
    const where = buildChecklistWhere(companyId, equipmentId, state);

    const [data, total] = await Promise.all([
      prisma.checklist_answers.findMany({
        where,
        skip,
        take,
        orderBy: buildChecklistOrderBy(state),
        select: CHECKLIST_ANSWER_SELECT,
      }),
      prisma.checklist_answers.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener las respuestas de checklist del equipo', { data: { error, equipmentId } });
    throw new Error('No se pudieron obtener los checklists. Intente nuevamente.');
  }
}

export type EquipmentChecklistAnswer = Awaited<ReturnType<typeof getEquipmentChecklistsPaginated>>['data'][number];

// ============================================================================
// EXPORT (sin paginación, con tope)
// ============================================================================

export async function getEquipmentChecklistsForExport(
  equipmentId: string,
  searchParams: DataTableSearchParams
): Promise<ExportResult<EquipmentChecklistAnswer[]>> {
  try {
    if (!equipmentId) return { ok: true, data: [] };

    const companyId = await requireEquipmentTabView(EQUIPMENT_CHECKLIST_TAB, equipmentId);
    const state = parseChecklistState(searchParams);
    const where = buildChecklistWhere(companyId, equipmentId, state);
    const orderBy = buildChecklistOrderBy(state);

    const data = await fetchExportRowsInBatches({
      maxRows: MAX_EXPORT_ROWS,
      listIds: (take) => prisma.checklist_answers.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.checklist_answers.findMany({
          where: { AND: [{ id: { in: ids } }, { company_id: companyId }, { equipment_id: equipmentId }] },
          select: CHECKLIST_ANSWER_SELECT,
        }),
      tooLargeMessage: tooManyRowsMessage('checklists'),
    });

    return { ok: true, data };
  } catch (error) {
    // Next enmascara el mensaje de un error lanzado desde una Server Action en producción: se devuelve en el resultado.
    if (error instanceof EquipmentHistoryAccessError || error instanceof ExportTooLargeError) {
      return { ok: false, message: error.message };
    }
    logger.error('Error al exportar los checklists del equipo', { data: { error, equipmentId } });
    return { ok: false, message: 'No se pudo exportar los checklists. Intente nuevamente.' };
  }
}

// ============================================================================
// FACETAS (lazy-load, con cross-filter)
// ============================================================================

/**
 * Faceta de UNA columna: conteos con los filtros activos de las OTRAS columnas. Devuelve `null` si la
 * columna no tiene faceta o falla (el filtro se muestra vacío en vez de romper el popover).
 */
export async function getEquipmentChecklistsSingleFacet(
  equipmentId: string,
  columnId: string,
  searchParams: DataTableSearchParams
) {
  if (!equipmentId) return null;

  try {
    const companyId = await requireEquipmentTabView(EQUIPMENT_CHECKLIST_TAB, equipmentId);
    const state = parseChecklistState(searchParams);
    const where = buildChecklistWhere(companyId, equipmentId, withoutOwnFilter(state, columnId));

    switch (columnId) {
      case 'result': {
        const rows = await prisma.checklist_answers.groupBy({ by: ['result'], where, _count: true });
        return { counts: toFacetMap(rows.map((row) => ({ key: row.result, count: row._count }))) };
      }

      case 'template': {
        const rows = await prisma.checklist_answers.groupBy({ by: ['template_id'], where, _count: true });
        const templateIds = rows.map((row) => row.template_id);
        const templates = templateIds.length
          ? await prisma.checklist_templates.findMany({
              where: { id: { in: templateIds } },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];

        return {
          counts: toFacetMap(rows.map((row) => ({ key: row.template_id, count: row._count }))),
          resolvedOptions: templates.map((template) => ({ value: template.id, label: template.name })),
        };
      }

      case 'performedBy': {
        const rows = await prisma.checklist_answers.groupBy({ by: ['user_id'], where, _count: true });
        const profileIds = rows.flatMap((row) => (row.user_id ? [row.user_id] : []));
        const profiles = profileIds.length
          ? await prisma.profile.findMany({
              where: { id: { in: profileIds } },
              select: { id: true, fullname: true },
              orderBy: { fullname: 'asc' },
            })
          : [];

        return {
          counts: toFacetMap(rows.map((row) => ({ key: row.user_id, count: row._count }))),
          resolvedOptions: profiles.map((profile) => ({ value: profile.id, label: profile.fullname ?? 'Sin nombre' })),
        };
      }

      case 'criticalItems': {
        const [failed, clean] = await Promise.all([
          prisma.checklist_answers.count({
            where: { AND: [where, { NOT: { critical_items_failed: { isEmpty: true } } }] },
          }),
          prisma.checklist_answers.count({ where: { AND: [where, { critical_items_failed: { isEmpty: true } }] } }),
        ]);
        const counts = new Map<string, number>();
        if (failed > 0) counts.set('true', failed);
        if (clean > 0) counts.set('false', clean);
        return { counts };
      }

      default:
        logger.warn('columnId no soportado en getEquipmentChecklistsSingleFacet', { data: { columnId } });
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener la faceta de checklists del equipo', { data: { error, equipmentId, columnId } });
    return null;
  }
}
