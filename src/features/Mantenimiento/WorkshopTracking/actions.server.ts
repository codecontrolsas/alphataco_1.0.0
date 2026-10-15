'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  buildDateRangeFiltersWhere,
  buildTextFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import {
  ORDER_LIST_EXPORT_MAX_ROWS,
  assembleOrdersWhere,
  descriptionTextCondition,
  getResourceConditionFacet,
  getResourceFacet,
  orderListExportTooLargeMessage,
  resolveOrderListScope,
  resourceConditionCondition,
  resourceIdsCondition,
  resourceOrderBy,
  resourceSearchCondition,
  resourceTextCondition,
  scopeConditions,
} from '../PedidosMantenimiento/lib/order-list-shared';
import { isTrackingAttentionKey, trackingAttentionCondition } from './attention-conditions';
import { DEFAULT_TRACKING_STATUSES, WORKSHOP_TRACKING_STATUSES } from './statuses';

const logger = new Logger('WorkshopTracking/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

const MODULE_SLUG = 'mantenimiento';
/** Tab "Seguimiento en Taller" (paso 2 del pipeline de Operaciones). */
const TAB_SLUG = 'seguimiento_taller';

/** Campos reales de maintenance_orders ordenables server-side */
const VALID_SORT_FIELDS = new Set([
  'order_number',
  'created_at',
  'workshop_entry_date',
  'scheduled_date',
  'status',
  // Columna resuelta via resourceOrderBy (vehículo o equipamiento)
  'vehicle',
]);

/** Columnas de texto libre de maintenance_orders (filtradas con buildTextFiltersWhere) */
const TEXT_COLUMNS = ['order_number'];

/** Columnas de texto libre sobre el recurso (vehículo o equipamiento) */
const RESOURCE_TEXT_COLUMNS = ['domain', 'serie', 'intern_number', 'kilometer'] as const;

/** Columnas con filtro de rango de fechas */
const DATE_RANGE_COLUMNS = ['workshop_entry_date', 'created_at', 'scheduled_date'];

/** Lista blanca de filtros: todo lo demás que venga en la URL se descarta. */
const ALLOWED_FILTERS = new Set([
  'status',
  // Filtro virtual: lo escriben las tarjetas de antigüedad (ver attention-conditions.ts)
  'attention',
  'vehicle',
  'condition',
  'description',
  ...TEXT_COLUMNS,
  ...RESOURCE_TEXT_COLUMNS,
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/**
 * Select común con todas las relaciones resueltas para el tracking.
 *
 * `maintenance_order_items` viaja podado a solo lo que consumen las columnas
 * "Recorrido Sectores" (buildSectorRoute) y "Progreso" (y sus equivalentes de export): sin
 * `is_diagnostico`, sin `order_number`/`status` de `work_orders`, sin
 * `id`/`status` de `work_order_items` y sin `repair_type_id` de las reparaciones
 * — ninguno se lee en `workshopTrackingColumns.tsx`. La auditoría del ticket 673
 * marcó este select como el más profundo (4 niveles) de la tabla.
 */
const WORKSHOP_TRACKING_SELECT = {
  id: true,
  order_number: true,
  status: true,
  workshop_entry_date: true,
  scheduled_date: true,
  created_at: true,
  kilometer_at_entry: true,
  engine_hours_at_entry: true,
  description: true,
  // FK: vehiculo o equipamiento (ticket 596) — uno de los dos viene en null
  vehicles: {
    select: {
      id: true,
      domain: true,
      serie: true,
      intern_number: true,
      kilometer: true,
      condition: true,
      // Subtipo que se muestra bajo la patente en la celda "Equipo"
      types_of_vehicles: { select: { name: true } },
    },
  },
  other_equipment: {
    select: {
      id: true,
      serial_number: true,
      intern_number: true,
      condition: true,
      type: { select: { name: true } },
    },
  },
  // Solicitud vinculada (fallback de descripción, origen y tipo preventivo)
  maintenance_requests: {
    select: {
      id: true,
      description: true,
      source: true,
      preventive_type: true,
    },
  },
  // Items con sectores y reparaciones (para "Recorrido Sectores" y "Progreso") — podado
  maintenance_order_items: {
    select: {
      id: true,
      assigned_sector_id: true,
      sector_sequence_order: true,
      // Un ítem rechazado en taller no cuenta como trabajo activo del sector (buildSectorRoute)
      is_rejected: true,
      workshop_sectors: {
        select: {
          id: true,
          name: true,
        },
      },
      work_orders: {
        select: {
          work_order_items: {
            select: {
              maintenance_order_item_id: true,
              work_order_item_repairs: {
                select: {
                  id: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  },
};

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Construye el WHERE compartido por el paginado, el export y las facets de
 * workshop tracking. Todo va dentro de un único `AND` con el perímetro: empresa,
 * tipos de equipamiento ocultos y filtro de supervisor (si el usuario no tiene
 * view_all_requests, solo ve órdenes donde él es supervisor de la solicitud).
 *
 * @param includeCompleted incluye las órdenes completadas en el universo base.
 *   Solo se usa al calcular la faceta de la columna "Estado", para que
 *   "Completada" aparezca con su count y el usuario pueda tildarla.
 *   Si el usuario filtra por estado, su selección reemplaza este default.
 */
async function buildWhereClause(
  companyId: string,
  state: ReturnType<typeof parseSearchParams>,
  includeCompleted = false
) {
  const scope = await resolveOrderListScope(companyId);
  const filters = sanitizeFilters(state, ALLOWED_FILTERS).filters;

  // Estado: la selección del usuario acotada a los estados del seguimiento, o el default.
  const statusValues = (filters.status ?? []).filter((v) => WORKSHOP_TRACKING_STATUSES.includes(v));
  const statusCondition = {
    status: { in: statusValues.length ? statusValues : includeCompleted ? WORKSHOP_TRACKING_STATUSES : DEFAULT_TRACKING_STATUSES },
  };

  const extra: Record<string, unknown>[] = [statusCondition];
  // Filtro virtual de las tarjetas de antigüedad: la MISMA condición que las cuenta (metrics.server.ts)
  const attention = filters.attention?.[0];
  if (isTrackingAttentionKey(attention)) extra.push(trackingAttentionCondition(attention));
  if (state.search) extra.push(resourceSearchCondition(state.search));
  if (filters.vehicle?.length) extra.push(resourceIdsCondition(filters.vehicle));
  if (filters.condition?.length) extra.push(resourceConditionCondition(filters.condition));
  if (filters.description?.[0]) extra.push(descriptionTextCondition(filters.description[0]));
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

export async function getWorkshopTrackingPaginated(searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    throw new Error('No tenés permiso para ver el seguimiento de taller');
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

    // Más reciente primero por defecto
    const safeOrderBy = [...resolvedSorts, { created_at: 'desc' as const }, { id: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.maintenance_orders.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: WORKSHOP_TRACKING_SELECT,
      }),
      prisma.maintenance_orders.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener seguimiento de taller paginado', { data: { error } });
    throw new Error('Error al obtener el seguimiento de taller');
  }
}

export type WorkshopTrackingListItem = Awaited<ReturnType<typeof getWorkshopTrackingPaginated>>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación, con tope)
// ============================================================================

export async function getAllWorkshopTrackingForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<WorkshopTrackingListItem[]>> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    return { ok: false, message: 'No tenés permiso para exportar el seguimiento de taller' };
  }

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const where = await buildWhereClause(companyId, state);

    const data = await prisma.maintenance_orders.findMany({
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
      where,
      select: WORKSHOP_TRACKING_SELECT,
      take: ORDER_LIST_EXPORT_MAX_ROWS + 1,
    });

    if (data.length > ORDER_LIST_EXPORT_MAX_ROWS) {
      return { ok: false, message: orderListExportTooLargeMessage('órdenes en seguimiento') };
    }

    return { ok: true, data };
  } catch (error) {
    logger.error('Error al exportar seguimiento de taller', { data: { error } });
    return { ok: false, message: 'Error al exportar el seguimiento de taller' };
  }
}

// ============================================================================
// FACETS — lazy-load individual por columna (con cross-filtering)
// ============================================================================

/**
 * Obtiene el facet (opciones + counts) de UNA sola columna, bajo demanda
 * (lazy-load). Implementa cross-filtering: excluye el filtro propio de la
 * columna consultada (reutilizando `buildWhereClause`).
 */
export async function getWorkshopTrackingSingleFacet(
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

    // La faceta de "Estado" necesita ver también las completadas para poder ofrecerlas
    const where = await buildWhereClause(companyId, withoutOwnFilter(state, columnId), columnId === 'status');

    switch (columnId) {
      case 'status': {
        const rows = await prisma.maintenance_orders.groupBy({ by: ['status'], where, _count: { _all: true } });
        return { counts: toFacetMap(rows.map((r) => ({ key: r.status, count: r._count._all }))) };
      }

      case 'vehicle':
        return await getResourceFacet(where);

      case 'condition':
        // La condición vive en el recurso (vehículo o equipamiento): se agrupa en memoria.
        return await getResourceConditionFacet(where);

      default:
        return null;
    }
  } catch (error) {
    logger.error('Error al obtener facet individual de seguimiento de taller', { data: { error, columnId } });
    return { counts: new Map() };
  }
}
