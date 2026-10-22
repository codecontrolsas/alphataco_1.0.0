'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { exportRowLimitMessage } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isConfirmedAttentionKey } from '../constants';
import {
  CONFIRMED_LIST_STATUS,
  ORDER_LIST_EXPORT_MAX_ROWS,
  assembleOrdersWhere,
  confirmedAttentionCondition,
  descriptionTextCondition,
  effectiveSourceCondition,
  getResourceConditionFacet,
  getResourceFacet,
  resolveOrderListScope,
  resourceConditionCondition,
  resourceIdsCondition,
  resourceOrderBy,
  resourceSearchCondition,
  resourceTextCondition,
  scopeConditions,
} from '../lib/order-list-shared';

const logger = new Logger('PedidosMantenimiento/Confirmados/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

const MODULE_SLUG = 'mantenimiento';
const TAB_SLUG = 'pedidos_confirmados';

/** Campos reales de maintenance_orders ordenables server-side */
const VALID_SORT_FIELDS = new Set([
  'created_at',
  'scheduled_date',
  'date_approved_at',
  'order_number',
  // Columna resuelta via resourceOrderBy (vehículo o equipamiento)
  'vehicle',
]);

/** Columnas con filtro de texto libre sobre el recurso (vehículo o equipamiento) */
const RESOURCE_TEXT_COLUMNS = ['domain', 'serie', 'intern_number'] as const;

/** Columnas con filtro de texto libre en maintenance_orders */
const TEXT_COLUMNS = ['order_number'];

/** Columnas con filtro de rango de fechas */
const DATE_RANGE_COLUMNS = ['created_at', 'scheduled_date', 'date_approved_at'];

/** Lista blanca de filtros: todo lo demás que venga en la URL se descarta. */
const ALLOWED_FILTERS = new Set([
  'vehicle',
  'condition',
  'source',
  'description',
  // Filtro virtual de la banda de atención (no es una columna): ver `confirmedAttentionCondition`
  'attention',
  ...RESOURCE_TEXT_COLUMNS,
  ...TEXT_COLUMNS,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Select común con todas las relaciones resueltas */
const CONFIRMED_ORDERS_SELECT = {
  id: true,
  status: true,
  scheduled_date: true,
  created_at: true,
  date_approved_at: true,
  order_number: true,
  description: true,
  source: true,
  preventive_type: true,
  // FK relations
  vehicles: {
    select: {
      id: true,
      domain: true,
      serie: true,
      intern_number: true,
      kilometer: true,
      condition: true,
      engine_hours: true,
    },
  },
  // Ticket 596: el pedido puede ser de un equipamiento en vez de un vehiculo
  other_equipment: {
    select: {
      id: true,
      serial_number: true,
      intern_number: true,
      condition: true,
      horometer: true,
    },
  },
  maintenance_requests: {
    select: {
      id: true,
      // Autor por defecto de los comentarios del pedido
      profile_maintenance_requests_supervisor_idToprofile: { select: { id: true, fullname: true } },
      kilometer: true,
      created_at: true,
      source: true,
      preventive_type: true,
      supervisor_id: true,
      description: true,
    },
  },
  maintenance_order_items: {
    select: {
      id: true,
      description: true,
      // Ticket 592: fotos del item; alimentan el visor de los dialogos de detalle
      // y de entrada a taller. Sin esto las miniaturas nunca se renderizan.
      images: true,
      maintenance_request_items: {
        select: {
          id: true,
          description: true,
          // Ticket 592: en la carga manual el item no tiene desvio de checklist,
          // su titulo es el texto libre que escribio el supervisor.
          free_text: true,
          // Fotos cargadas al crear la solicitud (la orden puede no tenerlas propias)
          images: true,
          // Comentarios del circuito: sin estos campos el bloque <ItemComments>
          // del dialogo se renderiza vacio aunque el item tenga observaciones.
          driver_comment: true,
          supervisor_comment: true,
          validator_comment: true,
          checklist_deviations: {
            select: {
              id: true,
              item_code: true,
              item_label: true,
              section_code: true,
              driver_comment: true,
            },
          },
        },
      },
      types_of_repairs: {
        select: { id: true, name: true },
      },
      maintenance_order_item_repair_types: {
        select: {
          repair_type_id: true,
          types_of_repairs: {
            select: { id: true, name: true },
          },
        },
      },
    },
  },
} as const;

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * WHERE de los pedidos confirmados (status = 'date_confirmed'). Compartido por la paginada, el export y las
 * facetas. Todo va dentro de un único `AND` junto con el perímetro (empresa, tipos ocultos, supervisor).
 */
async function buildWhereClause(companyId: string, state: ReturnType<typeof parseSearchParams>) {
  const scope = await resolveOrderListScope(companyId);
  const filters = sanitizeFilters(state, ALLOWED_FILTERS).filters;

  const extra: Record<string, unknown>[] = [{ status: CONFIRMED_LIST_STATUS }];

  if (state.search) extra.push(resourceSearchCondition(state.search));
  if (filters.vehicle?.length) extra.push(resourceIdsCondition(filters.vehicle));
  if (filters.condition?.length) extra.push(resourceConditionCondition(filters.condition));
  if (filters.source?.length) extra.push(effectiveSourceCondition(filters.source));
  if (filters.description?.[0]) extra.push(descriptionTextCondition(filters.description[0]));
  // Atención (virtual): la MISMA condición que cuenta la banda
  const attention = filters.attention?.[0];
  if (isConfirmedAttentionKey(attention)) extra.push(confirmedAttentionCondition(attention));
  for (const column of RESOURCE_TEXT_COLUMNS) {
    const term = filters[column]?.[0];
    if (term) extra.push(resourceTextCondition(column, term));
  }

  return assembleOrdersWhere({
    scope: scopeConditions(scope),
    extra,
    simple: [buildTextFiltersWhere(filters, TEXT_COLUMNS), buildDateRangeFiltersWhere(filters, DATE_RANGE_COLUMNS)],
  });
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getConfirmedOrdersPaginated(searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    throw new Error('No tenés permiso para ver los pedidos confirmados');
  }

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = await buildWhereClause(companyId, state);

    // Safe multi-sort: solo campos válidos
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        if (s.id === 'vehicle') resolvedSorts.push(...resourceOrderBy(dir));
        else resolvedSorts.push({ [s.id]: dir });
      }
    }

    // Lo ultimo cargado primero: es lo que el usuario espera ver al entrar a la tabla.
    const safeOrderBy = [...resolvedSorts, { created_at: 'desc' as const }, { id: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.maintenance_orders.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: CONFIRMED_ORDERS_SELECT,
      }),
      prisma.maintenance_orders.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener pedidos confirmados paginados', { data: { error } });
    throw new Error('Error al obtener los pedidos confirmados');
  }
}

export type ConfirmedOrderListItem = Awaited<ReturnType<typeof getConfirmedOrdersPaginated>>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación, con tope)
// ============================================================================

export async function getAllConfirmedOrdersForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<ConfirmedOrderListItem[]>> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    return { ok: false, message: 'No tenés permiso para exportar los pedidos confirmados' };
  }

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const where = await buildWhereClause(companyId, state);

    const data = await prisma.maintenance_orders.findMany({
      // Mismo orden que la tabla: lo mas reciente arriba.
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
      where,
      select: CONFIRMED_ORDERS_SELECT,
      take: ORDER_LIST_EXPORT_MAX_ROWS + 1,
    });

    if (data.length > ORDER_LIST_EXPORT_MAX_ROWS) {
      return { ok: false, message: exportRowLimitMessage(ORDER_LIST_EXPORT_MAX_ROWS, 'pedidos confirmados') };
    }

    return { ok: true, data };
  } catch (error) {
    logger.error('Error al exportar pedidos confirmados', { data: { error } });
    return { ok: false, message: 'Error al exportar los pedidos confirmados' };
  }
}

// ============================================================================
// FACET INDIVIDUAL (lazy-load, con cross-filtering)
// ============================================================================

/**
 * Carga counts + opciones de UNA sola columna, bajo demanda (al abrir el popover del filtro).
 * Cross-filtering: excluye el filtro propio de la columna consultada.
 */
export async function getConfirmedOrdersSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) return null;

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams || {});
    const where = await buildWhereClause(companyId, withoutOwnFilter(state, columnId));

    switch (columnId) {
      case 'vehicle':
        return await getResourceFacet(where);

      case 'condition':
        // La condición vive en el recurso (vehículo o equipamiento): se agrupa en memoria.
        return await getResourceConditionFacet(where);

      case 'source': {
        // Origen efectivo (el del pedido o, si no tiene, el de la solicitud): es el que muestra la celda.
        const orders = await prisma.maintenance_orders.findMany({
          where,
          select: { source: true, maintenance_requests: { select: { source: true } } },
        });
        const counts = toFacetMap(
          orders.map((order) => ({ key: order.source ?? order.maintenance_requests?.source ?? null, count: 1 }))
        );
        return { counts };
      }

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener facet individual de pedidos confirmados', { data: { error, columnId } });
    return { counts: new Map() };
  }
}
