'use server';

import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  NULL_FILTER_VALUE,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { ExportTooLargeError, fetchExportRowsInBatches } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import {
  EQUIPMENT_HISTORY_TAB,
  EquipmentHistoryAccessError,
  requireEquipmentTabView,
} from '../equipment-history-access';
import { argentinaDateRange, sanitizeUuidFilters, textFilterValue } from '../table-filters';

const logger = new Logger('Equipos/vehicle-rejected-requests-actions');

// ============================================================================
// CONSTANTES
// ============================================================================

/** Tope de filas por página: el DataTable de la ficha ofrece como máximo este tamaño. */
const MAX_PAGE_SIZE = 50;

/** Tope de filas del export a Excel. */
const MAX_EXPORT_ROWS = 10_000;

/** Filtros facetados que se resuelven directo sobre una columna de la solicitud. */
const COLUMN_MAP: Record<string, string> = { source: 'source' };

/** Columnas de texto que filtran un campo propio de la solicitud (columnId → campo). */
const TEXT_COLUMN_MAP: Record<string, string> = { description: 'description', preventiveType: 'preventive_type' };

/** Columnas cuyo filtro necesita una condición armada a mano (motivo/ítems en relaciones, supervisor, tipo, fecha). */
const CUSTOM_COLUMNS = ['rejectionType', 'rejectedBy', 'rejectionReason', 'items', 'supervisor', 'rejectedAt'] as const;

const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(COLUMN_MAP),
  ...Object.keys(TEXT_COLUMN_MAP),
  ...CUSTOM_COLUMNS,
  ...dateRangeKeys(['rejectedAt']),
]);

/** Una solicitud figura en esta vista si fue rechazada entera o si alguno de sus ítems fue rechazado. */
const REJECTED_BASE_WHERE: Prisma.maintenance_requestsWhereInput = {
  OR: [{ status: 'rejected' }, { maintenance_request_items: { some: { status: 'rejected' } } }],
};

type SortDirection = 'asc' | 'desc';

/** Columnas ordenables (las que tienen campo propio o relación directa). */
const SORT_BUILDERS: Record<string, (dir: SortDirection) => Prisma.maintenance_requestsOrderByWithRelationInput[]> = {
  rejectedAt: (dir) => [{ rejected_at: { sort: dir, nulls: 'last' } }, { created_at: { sort: dir, nulls: 'last' } }],
  rejectionType: (dir) => [{ status: dir }],
  source: (dir) => [{ source: { sort: dir, nulls: 'last' } }],
  rejectedBy: (dir) => [
    { profile_maintenance_requests_rejected_byToprofile: { fullname: { sort: dir, nulls: 'last' } } },
  ],
  supervisor: (dir) => [
    { profile_maintenance_requests_supervisor_idToprofile: { fullname: { sort: dir, nulls: 'last' } } },
  ],
  preventiveType: (dir) => [{ preventive_type: { sort: dir, nulls: 'last' } }],
};

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

function parseRejectedState(searchParams: DataTableSearchParams) {
  const state = sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
  return { ...state, filters: sanitizeUuidFilters(state.filters, ['rejectedBy']) };
}

type RejectedState = ReturnType<typeof parseRejectedState>;

/** Condición sobre los ítems RECHAZADOS de la solicitud cuyo texto (ítem, desvío o motivo) contiene `term`. */
function rejectedItemsTextWhere(
  term: string,
  fields: 'label' | 'reason' | 'all'
): Prisma.maintenance_requestsWhereInput {
  const contains = { contains: term, mode: 'insensitive' as const };
  const label: Prisma.maintenance_request_itemsWhereInput[] = [
    { description: contains },
    { types_of_repairs: { name: contains } },
    { checklist_deviations: { item_label: contains } },
  ];
  const reason: Prisma.maintenance_request_itemsWhereInput[] = [{ rejection_reason: contains }];

  const conditions = fields === 'label' ? label : fields === 'reason' ? reason : [...label, ...reason];
  return { maintenance_request_items: { some: { status: 'rejected', OR: conditions } } };
}

function buildRejectionTypeWhere(values: string[] | undefined): Prisma.maintenance_requestsWhereInput {
  const wantsTotal = !!values?.includes('total');
  const wantsPartial = !!values?.includes('partial');
  if (wantsTotal === wantsPartial) return {};
  return wantsTotal ? { status: 'rejected' } : { NOT: { status: 'rejected' } };
}

function buildRejectedByWhere(values: string[] | undefined): Prisma.maintenance_requestsWhereInput {
  if (!values?.length) return {};

  const profileIds = values.filter((value) => value !== NULL_FILTER_VALUE);
  const clauses: Prisma.maintenance_requestsWhereInput[] = [];
  if (profileIds.length > 0) clauses.push({ rejected_by: { in: profileIds } });
  if (values.includes(NULL_FILTER_VALUE)) clauses.push({ rejected_by: null });

  return { OR: clauses };
}

/** La fecha de rechazo que muestra la tabla es `rejected_at` y, si falta, `created_at`. */
function buildRejectedAtWhere(filters: Record<string, string[]>): Prisma.maintenance_requestsWhereInput {
  const range = argentinaDateRange(filters, 'rejectedAt');
  if (!range) return {};
  return { OR: [{ rejected_at: range }, { AND: [{ rejected_at: null }, { created_at: range }] }] };
}

/**
 * WHERE compartido entre la página, el export y las facetas. El perímetro (empresa y equipo) y la base
 * "rechazada" (que tiene un `OR` en la raíz) van en el mismo `AND` que el resto: ningún filtro los pisa.
 */
function buildRejectedWhere(
  companyId: string,
  equipmentId: string,
  state: RejectedState
): Prisma.maintenance_requestsWhereInput {
  const { filters } = state;

  const filtersWhere = buildFiltersWhere(filters, COLUMN_MAP, {
    exclude: [...Object.keys(TEXT_COLUMN_MAP), ...CUSTOM_COLUMNS, ...dateRangeKeys(['rejectedAt'])],
  });
  const textWhere = buildTextFiltersWhere(filters, Object.keys(TEXT_COLUMN_MAP), TEXT_COLUMN_MAP);

  const reasonTerm = textFilterValue(filters, 'rejectionReason');
  const itemsTerm = textFilterValue(filters, 'items');
  const supervisorTerm = textFilterValue(filters, 'supervisor');

  const reasonWhere: Prisma.maintenance_requestsWhereInput = reasonTerm
    ? {
        OR: [
          { rejection_reason: { contains: reasonTerm, mode: 'insensitive' } },
          rejectedItemsTextWhere(reasonTerm, 'reason'),
        ],
      }
    : {};

  const supervisorWhere: Prisma.maintenance_requestsWhereInput = supervisorTerm
    ? {
        profile_maintenance_requests_supervisor_idToprofile: {
          fullname: { contains: supervisorTerm, mode: 'insensitive' },
        },
      }
    : {};

  const search = state.search.trim();
  const searchWhere: Prisma.maintenance_requestsWhereInput = search
    ? {
        OR: [
          buildSearchWhere(search, [
            'rejection_reason',
            'description',
            'source',
            'preventive_type',
          ]) as Prisma.maintenance_requestsWhereInput,
          rejectedItemsTextWhere(search, 'all'),
        ],
      }
    : {};

  return {
    AND: [
      { company_id: companyId },
      { equipment_id: equipmentId },
      REJECTED_BASE_WHERE,
      filtersWhere as Prisma.maintenance_requestsWhereInput,
      textWhere as Prisma.maintenance_requestsWhereInput,
      buildRejectionTypeWhere(filters.rejectionType),
      buildRejectedByWhere(filters.rejectedBy),
      buildRejectedAtWhere(filters),
      reasonWhere,
      itemsTerm ? rejectedItemsTextWhere(itemsTerm, 'label') : {},
      supervisorWhere,
      searchWhere,
    ],
  };
}

function buildRejectedOrderBy(state: RejectedState): Prisma.maintenance_requestsOrderByWithRelationInput[] {
  const sorts = state.sorting.flatMap((sort) => {
    const builder = SORT_BUILDERS[sort.id];
    return builder ? builder(sort.desc ? 'desc' : 'asc') : [];
  });

  // Desempate por id: sin él, el orden entre filas iguales cambia de una página a otra.
  return [...(sorts.length > 0 ? sorts : SORT_BUILDERS.rejectedAt('desc')), { id: 'asc' }];
}

const REJECTED_REQUEST_SELECT = {
  id: true,
  status: true,
  created_at: true,
  rejected_at: true,
  rejection_reason: true,
  source: true,
  description: true,
  preventive_type: true,
  profile_maintenance_requests_rejected_byToprofile: { select: { id: true, fullname: true } },
  profile_maintenance_requests_supervisor_idToprofile: { select: { id: true, fullname: true } },
  // Solo los ítems rechazados: son los que interesan en esta vista
  maintenance_request_items: {
    where: { status: 'rejected' },
    select: {
      id: true,
      rejection_reason: true,
      validator_comment: true,
      description: true,
      types_of_repairs: { select: { id: true, name: true } },
      checklist_deviations: { select: { id: true, item_label: true, item_code: true } },
    },
  },
} satisfies Prisma.maintenance_requestsSelect;

// ============================================================================
// PÁGINA
// ============================================================================

/**
 * Página de las solicitudes de mantenimiento rechazadas (total o parcialmente) de un equipo. Estas
 * solicitudes no generan orden, así que este es el único lugar del sistema donde quedan registradas.
 *
 * Lanza si no hay permiso o si la consulta falla: la UI debe distinguir "no se pudo cargar" de "no hay rechazos".
 */
export async function getEquipmentRejectedRequestsPaginated(equipmentId: string, searchParams: DataTableSearchParams) {
  // Ficha de un equipo nuevo (sin id): vacío legítimo, no una falla.
  if (!equipmentId) return { data: [], total: 0 };

  const companyId = await requireEquipmentTabView(EQUIPMENT_HISTORY_TAB, equipmentId);

  try {
    const state = parseRejectedState(searchParams);
    const { skip, take } = clampedPageParams(state, { max: MAX_PAGE_SIZE });
    const where = buildRejectedWhere(companyId, equipmentId, state);

    const [data, total] = await Promise.all([
      prisma.maintenance_requests.findMany({
        where,
        skip,
        take,
        orderBy: buildRejectedOrderBy(state),
        select: REJECTED_REQUEST_SELECT,
      }),
      prisma.maintenance_requests.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener las solicitudes rechazadas del equipo', { data: { error, equipmentId } });
    throw new Error('No se pudieron obtener las solicitudes rechazadas. Intente nuevamente.');
  }
}

export type EquipmentRejectedRequest = Awaited<
  ReturnType<typeof getEquipmentRejectedRequestsPaginated>
>['data'][number];

// ============================================================================
// EXPORT (sin paginación, con tope)
// ============================================================================

export async function getEquipmentRejectedRequestsForExport(
  equipmentId: string,
  searchParams: DataTableSearchParams
): Promise<ExportResult<EquipmentRejectedRequest[]>> {
  try {
    if (!equipmentId) return { ok: true, data: [] };

    const companyId = await requireEquipmentTabView(EQUIPMENT_HISTORY_TAB, equipmentId);
    const state = parseRejectedState(searchParams);
    const where = buildRejectedWhere(companyId, equipmentId, state);
    const orderBy = buildRejectedOrderBy(state);

    const data = await fetchExportRowsInBatches({
      maxRows: MAX_EXPORT_ROWS,
      listIds: (take) => prisma.maintenance_requests.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.maintenance_requests.findMany({
          where: { AND: [{ id: { in: ids } }, { company_id: companyId }, { equipment_id: equipmentId }] },
          select: REJECTED_REQUEST_SELECT,
        }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} solicitudes con los filtros actuales. Acote la exportación con filtros.`,
    });

    return { ok: true, data };
  } catch (error) {
    // Next enmascara el mensaje de un error lanzado desde una Server Action en producción: se devuelve en el resultado.
    if (error instanceof EquipmentHistoryAccessError || error instanceof ExportTooLargeError) {
      return { ok: false, message: error.message };
    }
    logger.error('Error al exportar las solicitudes rechazadas del equipo', { data: { error, equipmentId } });
    return { ok: false, message: 'No se pudo exportar las solicitudes rechazadas. Intente nuevamente.' };
  }
}

// ============================================================================
// FACETAS (lazy-load, con cross-filter)
// ============================================================================

/**
 * Faceta de UNA columna: conteos con los filtros activos de las OTRAS columnas. Devuelve `null` si la
 * columna no tiene faceta o falla (el filtro se muestra vacío en vez de romper el popover).
 */
export async function getEquipmentRejectedRequestsSingleFacet(
  equipmentId: string,
  columnId: string,
  searchParams: DataTableSearchParams
) {
  if (!equipmentId) return null;

  try {
    const companyId = await requireEquipmentTabView(EQUIPMENT_HISTORY_TAB, equipmentId);
    const state = parseRejectedState(searchParams);
    const where = buildRejectedWhere(companyId, equipmentId, withoutOwnFilter(state, columnId));

    switch (columnId) {
      case 'rejectionType': {
        const [total, partial] = await Promise.all([
          prisma.maintenance_requests.count({ where: { AND: [where, { status: 'rejected' }] } }),
          prisma.maintenance_requests.count({ where: { AND: [where, { NOT: { status: 'rejected' } }] } }),
        ]);
        const counts = new Map<string, number>();
        if (total > 0) counts.set('total', total);
        if (partial > 0) counts.set('partial', partial);
        return { counts };
      }

      case 'source': {
        const rows = await prisma.maintenance_requests.groupBy({ by: ['source'], where, _count: true });
        return { counts: toFacetMap(rows.map((row) => ({ key: row.source, count: row._count }))) };
      }

      case 'rejectedBy': {
        const rows = await prisma.maintenance_requests.groupBy({ by: ['rejected_by'], where, _count: true });
        const counts = toFacetMap(rows.map((row) => ({ key: row.rejected_by, count: row._count })));

        const profileIds = rows.flatMap((row) => (row.rejected_by ? [row.rejected_by] : []));
        const profiles = profileIds.length
          ? await prisma.profile.findMany({
              where: { id: { in: profileIds } },
              select: { id: true, fullname: true },
              orderBy: { fullname: 'asc' },
            })
          : [];

        return {
          counts,
          resolvedOptions: profiles.map((profile) => ({ value: profile.id, label: profile.fullname ?? 'Sin nombre' })),
        };
      }

      default:
        logger.warn('columnId no soportado en getEquipmentRejectedRequestsSingleFacet', { data: { columnId } });
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener la faceta de solicitudes rechazadas', { data: { error, equipmentId, columnId } });
    return null;
  }
}
