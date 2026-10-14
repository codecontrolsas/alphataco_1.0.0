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
import { repairsKey, summarizeOrderItems } from '../equipment-order-summary';
import { argentinaDateRange, isUuid, sanitizeUuidFilters } from '../table-filters';

const logger = new Logger('Equipos/vehicle-operations-actions');

// ============================================================================
// CONSTANTES
// ============================================================================

/** Tope de filas por página: el DataTable de la ficha ofrece como máximo este tamaño. */
const MAX_PAGE_SIZE = 50;

/** Tope de filas del export a Excel. */
const MAX_EXPORT_ROWS = 10_000;

const TEXT_COLUMNS = ['order_number'] as const;
const DATE_RANGE_COLUMNS = ['workshop_entry_date', 'created_at'] as const;

/** Filtros facetados que se resuelven directo sobre una columna de la orden. */
const COLUMN_MAP: Record<string, string> = { status: 'status' };

/**
 * Únicas claves de URL que filtran la tabla: `parseSearchParams` convierte CUALQUIER clave en filtro y
 * `buildFiltersWhere` la usaría como campo de Prisma.
 */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(COLUMN_MAP),
  ...TEXT_COLUMNS,
  'sector',
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

type SortDirection = 'asc' | 'desc';

/** Columnas ordenables. Las calculadas (sectores, ítems, OTs, progreso) no tienen campo en la base. */
const SORT_BUILDERS: Record<string, (dir: SortDirection) => Prisma.maintenance_ordersOrderByWithRelationInput> = {
  order_number: (dir) => ({ order_number: dir }),
  status: (dir) => ({ status: dir }),
  workshop_entry_date: (dir) => ({ workshop_entry_date: { sort: dir, nulls: 'last' } }),
  created_at: (dir) => ({ created_at: { sort: dir, nulls: 'last' } }),
};

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

function parseOrdersState(searchParams: DataTableSearchParams) {
  const state = sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
  return { ...state, filters: sanitizeUuidFilters(state.filters, ['sector']) };
}

type OrdersState = ReturnType<typeof parseOrdersState>;

/** Filtro por sector de las ÓRDENES: alguno de sus ítems asignado al sector (o ninguno asignado: "Sin asignar"). */
function buildSectorWhere(values: string[] | undefined): Prisma.maintenance_ordersWhereInput {
  if (!values?.length) return {};

  const sectorIds = values.filter((value) => value !== NULL_FILTER_VALUE);
  const clauses: Prisma.maintenance_ordersWhereInput[] = [];

  if (sectorIds.length > 0) {
    clauses.push({ maintenance_order_items: { some: { assigned_sector_id: { in: sectorIds } } } });
  }
  if (values.includes(NULL_FILTER_VALUE)) {
    clauses.push({ maintenance_order_items: { none: { assigned_sector_id: { not: null } } } });
  }

  return { OR: clauses };
}

/**
 * WHERE compartido entre la página, el export y las facetas. El perímetro (empresa y equipo) va en el mismo
 * `AND` que los filtros: ningún filtro de la URL puede pisarlo.
 */
function buildOrdersWhere(
  companyId: string,
  equipmentId: string,
  state: OrdersState
): Prisma.maintenance_ordersWhereInput {
  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [...TEXT_COLUMNS, 'sector', ...dateRangeKeys(DATE_RANGE_COLUMNS)],
  });
  const textWhere = buildTextFiltersWhere(state.filters, [...TEXT_COLUMNS]);
  const searchWhere = buildSearchWhere(state.search, ['order_number']);

  const dateWheres = DATE_RANGE_COLUMNS.flatMap((column) => {
    const range = argentinaDateRange(state.filters, column);
    return range ? [{ [column]: range } as Prisma.maintenance_ordersWhereInput] : [];
  });

  return {
    AND: [
      { company_id: companyId },
      { equipment_id: equipmentId },
      filtersWhere as Prisma.maintenance_ordersWhereInput,
      textWhere as Prisma.maintenance_ordersWhereInput,
      searchWhere as Prisma.maintenance_ordersWhereInput,
      buildSectorWhere(state.filters.sector),
      ...dateWheres,
    ],
  };
}

function buildOrdersOrderBy(state: OrdersState): Prisma.maintenance_ordersOrderByWithRelationInput[] {
  const sorts = state.sorting.flatMap((sort) => {
    const builder = SORT_BUILDERS[sort.id];
    return builder ? [builder(sort.desc ? 'desc' : 'asc')] : [];
  });

  // Desempate por id: sin él, el orden entre filas iguales cambia de una página a otra.
  return [...(sorts.length > 0 ? sorts : [SORT_BUILDERS.created_at('desc')]), { id: 'asc' }];
}

const ORDER_LIST_SELECT = {
  id: true,
  order_number: true,
  status: true,
  created_at: true,
  workshop_entry_date: true,
  maintenance_requests: { select: { id: true } },
  maintenance_order_items: {
    select: {
      id: true,
      is_diagnostico: true,
      assigned_sector_id: true,
      sector_sequence_order: true,
      work_order_id: true,
      workshop_sectors: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.maintenance_ordersSelect;

/**
 * Agrega a cada orden el resumen que muestra la tabla. Trae, aparte y para toda la página, solo el `status`
 * de las reparaciones de la OT de cada ítem: no viajan las órdenes de trabajo completas.
 */
async function withOrderSummaries(
  orders: Array<Prisma.maintenance_ordersGetPayload<{ select: typeof ORDER_LIST_SELECT }>>
) {
  const itemIds = orders.flatMap((order) => order.maintenance_order_items.map((item) => item.id));
  const workOrderIds = [
    ...new Set(
      orders.flatMap((order) =>
        order.maintenance_order_items.flatMap((item) => (item.work_order_id ? [item.work_order_id] : []))
      )
    ),
  ];

  const workOrderItems =
    itemIds.length > 0 && workOrderIds.length > 0
      ? await prisma.work_order_items.findMany({
          where: { maintenance_order_item_id: { in: itemIds }, work_order_id: { in: workOrderIds } },
          select: {
            maintenance_order_item_id: true,
            work_order_id: true,
            work_order_item_repairs: { select: { status: true } },
          },
        })
      : [];

  const repairStatuses = new Map<string, string[]>();
  for (const workOrderItem of workOrderItems) {
    repairStatuses.set(
      repairsKey(workOrderItem.maintenance_order_item_id, workOrderItem.work_order_id),
      workOrderItem.work_order_item_repairs.map((repair) => repair.status)
    );
  }

  return orders.map((order) => ({
    id: order.id,
    order_number: order.order_number,
    status: order.status,
    created_at: order.created_at,
    workshop_entry_date: order.workshop_entry_date,
    maintenanceRequestId: order.maintenance_requests?.id ?? null,
    ...summarizeOrderItems(order.maintenance_order_items, repairStatuses),
  }));
}

// ============================================================================
// PÁGINA
// ============================================================================

/**
 * Página del historial de órdenes de mantenimiento de un equipo (acotada a 50 filas, más recientes primero).
 * Las columnas calculadas (sectores, ítems, OTs, progreso) salen resumidas; el detalle completo de una
 * orden se pide recién al abrirla con `getEquipmentOrderDetail`.
 *
 * Lanza si no hay permiso o si la consulta falla: la UI debe distinguir "no se pudo cargar" de "no hay órdenes".
 */
export async function getEquipmentOrdersPaginated(equipmentId: string, searchParams: DataTableSearchParams) {
  // Ficha de un equipo nuevo (sin id): vacío legítimo, no una falla.
  if (!equipmentId) return { data: [], total: 0 };

  const companyId = await requireEquipmentTabView(EQUIPMENT_HISTORY_TAB, equipmentId);

  try {
    const state = parseOrdersState(searchParams);
    const { skip, take } = clampedPageParams(state, { max: MAX_PAGE_SIZE });
    const where = buildOrdersWhere(companyId, equipmentId, state);

    const [orders, total] = await Promise.all([
      prisma.maintenance_orders.findMany({
        where,
        skip,
        take,
        orderBy: buildOrdersOrderBy(state),
        select: ORDER_LIST_SELECT,
      }),
      prisma.maintenance_orders.count({ where }),
    ]);

    return { data: await withOrderSummaries(orders), total };
  } catch (error) {
    logger.error('Error al obtener el historial de órdenes del equipo', { data: { error, equipmentId } });
    throw new Error('No se pudo obtener el historial de órdenes. Intente nuevamente.');
  }
}

export type EquipmentOrderRow = Awaited<ReturnType<typeof getEquipmentOrdersPaginated>>['data'][number];

// ============================================================================
// EXPORT (sin paginación, con tope)
// ============================================================================

export async function getEquipmentOrdersForExport(
  equipmentId: string,
  searchParams: DataTableSearchParams
): Promise<ExportResult<EquipmentOrderRow[]>> {
  try {
    if (!equipmentId) return { ok: true, data: [] };

    const companyId = await requireEquipmentTabView(EQUIPMENT_HISTORY_TAB, equipmentId);
    const state = parseOrdersState(searchParams);
    const where = buildOrdersWhere(companyId, equipmentId, state);
    const orderBy = buildOrdersOrderBy(state);

    // Por tandas y con tope: no se materializa de una vez el historial entero del equipo.
    const orders = await fetchExportRowsInBatches({
      maxRows: MAX_EXPORT_ROWS,
      listIds: (take) => prisma.maintenance_orders.findMany({ where, orderBy, select: { id: true }, take }),
      fetchByIds: (ids) =>
        prisma.maintenance_orders.findMany({
          where: { AND: [{ id: { in: ids } }, { company_id: companyId }, { equipment_id: equipmentId }] },
          select: ORDER_LIST_SELECT,
        }),
      tooLargeMessage: (maxRows) =>
        `Hay más de ${maxRows.toLocaleString('es-AR')} órdenes con los filtros actuales. Acote la exportación con filtros.`,
    });

    return { ok: true, data: await withOrderSummaries(orders) };
  } catch (error) {
    // Next enmascara el mensaje de un error lanzado desde una Server Action en producción: se devuelve en el resultado.
    if (error instanceof EquipmentHistoryAccessError || error instanceof ExportTooLargeError) {
      return { ok: false, message: error.message };
    }
    logger.error('Error al exportar el historial de órdenes del equipo', { data: { error, equipmentId } });
    return { ok: false, message: 'No se pudo exportar el historial de órdenes. Intente nuevamente.' };
  }
}

// ============================================================================
// FACETAS (lazy-load, con cross-filter)
// ============================================================================

/**
 * Faceta de UNA columna: conteos con los filtros activos de las OTRAS columnas. Devuelve `null` si la
 * columna no tiene faceta o falla (el filtro se muestra vacío en vez de romper el popover).
 */
export async function getEquipmentOrdersSingleFacet(
  equipmentId: string,
  columnId: string,
  searchParams: DataTableSearchParams
) {
  if (!equipmentId) return null;

  try {
    const companyId = await requireEquipmentTabView(EQUIPMENT_HISTORY_TAB, equipmentId);
    const state = parseOrdersState(searchParams);
    const where = buildOrdersWhere(companyId, equipmentId, withoutOwnFilter(state, columnId));

    switch (columnId) {
      case 'status': {
        const rows = await prisma.maintenance_orders.groupBy({ by: ['status'], where, _count: true });
        return { counts: toFacetMap(rows.map((row) => ({ key: row.status, count: row._count }))) };
      }

      case 'sector': {
        // Una fila por (sector, orden): cada sector cuenta las ÓRDENES distintas, no sus ítems.
        const [pairs, unassigned] = await Promise.all([
          prisma.maintenance_order_items.groupBy({
            by: ['assigned_sector_id', 'maintenance_order_id'],
            where: { assigned_sector_id: { not: null }, maintenance_orders: where },
          }),
          prisma.maintenance_orders.count({
            where: { AND: [where, { maintenance_order_items: { none: { assigned_sector_id: { not: null } } } }] },
          }),
        ]);

        const ordersBySector = new Map<string, number>();
        for (const pair of pairs) {
          if (!pair.assigned_sector_id) continue;
          ordersBySector.set(pair.assigned_sector_id, (ordersBySector.get(pair.assigned_sector_id) ?? 0) + 1);
        }

        const sectors = ordersBySector.size
          ? await prisma.workshop_sectors.findMany({
              where: { id: { in: [...ordersBySector.keys()] } },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [];

        const counts = new Map(ordersBySector);
        if (unassigned > 0) counts.set(NULL_FILTER_VALUE, unassigned);

        return { counts, resolvedOptions: sectors.map((sector) => ({ value: sector.id, label: sector.name })) };
      }

      default:
        logger.warn('columnId no soportado en getEquipmentOrdersSingleFacet', { data: { columnId } });
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener la faceta del historial de órdenes', { data: { error, equipmentId, columnId } });
    return null;
  }
}

// ============================================================================
// DETALLE (bajo demanda, al abrir una orden)
// ============================================================================

const ORDER_DETAIL_SELECT = {
  id: true,
  order_number: true,
  status: true,
  created_at: true,
  workshop_entry_date: true,
  workshop_validated_at: true,
  operations_validated_at: true,
  workshop_validation_notes: true,
  operations_validation_notes: true,
  maintenance_requests: { select: { id: true, source: true } },
  maintenance_order_items: {
    select: {
      id: true,
      description: true,
      is_diagnostico: true,
      sector_sequence_order: true,
      assigned_sector_id: true,
      types_of_repairs: { select: { id: true, name: true, autorizable: true } },
      workshop_sectors: { select: { id: true, name: true } },
      maintenance_request_items: {
        select: { driver_comment: true, validator_comment: true, description: true },
      },
      work_orders: {
        select: {
          id: true,
          order_number: true,
          status: true,
          started_at: true,
          completed_at: true,
          work_order_items: {
            select: {
              id: true,
              status: true,
              maintenance_order_item_id: true,
              work_order_item_repairs: {
                select: {
                  id: true,
                  status: true,
                  is_diagnostico: true,
                  is_operator_added: true,
                  types_of_repairs: { select: { id: true, name: true, autorizable: true } },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.maintenance_ordersSelect;

/** Acciones del log de actividad que forman el historial de validaciones de una orden. */
const VALIDATION_ACTION_TYPES = [
  'workshop_item_rejected',
  'operations_item_rejected',
  'workshop_agreed_ops_rejection',
  'workshop_disagreed_ops_rejection',
  'workshop_approved',
  'operations_approved',
  'workshop_rejected_all_items',
  'workshop_restored_from_rejected',
  'status_change',
];

/**
 * Detalle completo de UNA orden (sectores, órdenes de trabajo, reparaciones y historial de validaciones).
 * Se acota por empresa Y por equipo: no se puede pedir una orden de otro equipo con solo conocer su id.
 */
export async function getEquipmentOrderDetail(equipmentId: string, orderId: string) {
  if (!equipmentId || !isUuid(orderId)) throw new EquipmentHistoryAccessError('Orden inválida');

  const companyId = await requireEquipmentTabView(EQUIPMENT_HISTORY_TAB, equipmentId);

  try {
    const [order, validationHistory] = await Promise.all([
      prisma.maintenance_orders.findFirst({
        where: { id: orderId, company_id: companyId, equipment_id: equipmentId },
        select: ORDER_DETAIL_SELECT,
      }),
      prisma.maintenance_activity_log.findMany({
        where: { maintenance_order_id: orderId, company_id: companyId, action_type: { in: VALIDATION_ACTION_TYPES } },
        orderBy: { performed_at: 'desc' },
        select: {
          id: true,
          action_type: true,
          performed_at: true,
          notes: true,
          metadata: true,
          profile: { select: { id: true, fullname: true } },
        },
      }),
    ]);

    if (!order) throw new EquipmentHistoryAccessError('La orden no pertenece a este equipo');

    return { ...order, validationHistory };
  } catch (error) {
    if (error instanceof EquipmentHistoryAccessError) throw error;
    logger.error('Error al obtener el detalle de la orden del equipo', { data: { error, equipmentId, orderId } });
    throw new Error('No se pudo obtener el detalle de la orden. Intente nuevamente.');
  }
}

export type EquipmentOrderDetail = Awaited<ReturnType<typeof getEquipmentOrderDetail>>;
