'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { visibleEquipmentTypeCondition } from '../../shared/maintenance-resource';
import { getHiddenEquipmentTypeIds } from '../../utils/equipmentTypeVisibility';
import { OPEN_WORK_ORDERS_ONLY, OPEN_WORK_ORDER_STATUSES } from '../workshop-view-filters';

const logger = new Logger('features/WorkshopView/WorkshopSectorTasksTable');

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Ticket 678 — esta tabla lista ÓRDENES DE TRABAJO, una fila por OT.
 *
 * Antes listaba tareas (`maintenance_order_items`), así que una OT con cuatro
 * tareas ocupaba cuatro filas y el acordeón informaba "4 órdenes de trabajo".
 * Una OT pertenece a UNA unidad; las tareas que tiene adentro se ven en el modal
 * de la columna de acciones.
 */

/** Campos ordenables server-side (directos de work_orders o via FK_SORT_MAP) */
const VALID_SORT_FIELDS = new Set([
  'planned_start_date',
  'planned_end_date',
  'started_at',
  'created_at',
  // Columnas resueltas via FK_SORT_MAP:
  'work_order',
  'wo_status',
  'vehicle',
  'task_count',
]);

/** Mapeo de columnId → orderBy de Prisma para columnas que no son campos directos */
const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  work_order: (dir) => ({ order_number: dir }),
  wo_status: (dir) => ({ status: dir }),
  vehicle: (dir) => ({ vehicles: { domain: dir } }),
  // Cantidad de tareas de la OT — Prisma ordena por el count de la relación
  task_count: (dir) => ({ maintenance_order_items: { _count: dir } }),
};

/** Columnas con filtro de rango de fechas (campos directos de work_orders) */
const DATE_RANGE_COLUMNS = ['planned_start_date', 'planned_end_date', 'started_at', 'created_at'];

/** Lista blanca de filtros: todo lo demás que venga en la URL se descarta. */
const ALLOWED_FILTERS = new Set([
  'work_order',
  'wo_status',
  'maintenance_order',
  'mo_status',
  'vehicle',
  'repair_type',
  'is_critical',
  'is_rejected',
  'is_diagnostico',
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** La Vista Taller es la tab `workshop_view` del módulo de mantenimiento. */
const MODULE_SLUG = 'mantenimiento';
const TAB_SLUG = 'workshop_view';

/** Tope de filas de un export: más que esto no se descarga entero (se pide acotar con filtros). */
const EXPORT_MAX_ROWS = 10_000;

/** Select con todo lo que la tabla de OT necesita */
const SECTOR_WORK_ORDERS_SELECT = {
  id: true,
  order_number: true,
  status: true,
  planned_start_date: true,
  planned_end_date: true,
  // `started_at` es la fecha real de entrada al taller: `actual_start_date`
  // existe en el modelo pero el flujo nunca la escribe (0 filas en toda la BD).
  started_at: true,
  created_at: true,
  // Ticket 596: la OT puede ser de un vehiculo O de un equipamiento
  vehicles: { select: { id: true, domain: true, serie: true, intern_number: true } },
  other_equipment: { select: { id: true, serial_number: true, intern_number: true } },
  // Cantidad de tareas de la OT (la columna que pidió el ticket 678)
  _count: { select: { maintenance_order_items: true } },
  // OM de la que salieron las tareas — en la práctica siempre una sola
  maintenance_order_items: {
    select: {
      maintenance_orders: { select: { id: true, order_number: true, status: true } },
    },
  },
};

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Aplana la fila de Prisma a la forma que consume la tabla.
 *
 * Las OM se deduplican: una OT puede tener varias tareas y todas apuntan a la
 * misma OM, así que sin deduplicar la celda repetiría el mismo número N veces.
 */
function mapWorkOrderRow(row: {
  id: string;
  order_number: string;
  status: string;
  planned_start_date: Date;
  planned_end_date: Date;
  started_at: Date | null;
  created_at: Date | null;
  vehicles: { id: string; domain: string | null; serie: string | null; intern_number: string | null } | null;
  other_equipment: { id: string; serial_number: string | null; intern_number: string | null } | null;
  _count: { maintenance_order_items: number };
  maintenance_order_items: Array<{
    maintenance_orders: { id: string; order_number: string | null; status: string };
  }>;
}) {
  const ordersById = new Map<string, { id: string; order_number: string | null; status: string }>();
  for (const item of row.maintenance_order_items) {
    if (item.maintenance_orders) ordersById.set(item.maintenance_orders.id, item.maintenance_orders);
  }

  return {
    id: row.id,
    order_number: row.order_number,
    status: row.status,
    planned_start_date: row.planned_start_date,
    planned_end_date: row.planned_end_date,
    started_at: row.started_at,
    created_at: row.created_at,
    // Se conservan los nombres de relación para poder usar los helpers compartidos
    // de recurso (`getResourceLabel` y compañía) sin adaptadores.
    vehicles: row.vehicles,
    other_equipment: row.other_equipment,
    taskCount: row._count.maintenance_order_items,
    maintenanceOrders: Array.from(ordersById.values()),
  };
}

/**
 * WHERE compartido entre la query paginada, la de exportación y los facets.
 *
 * Todo va dentro de `AND` a propósito: varias condiciones caen sobre el mismo
 * campo (`status` del recorte de OT cerradas + `status` del filtro del usuario)
 * y spreadearlas al nivel raíz haría que una pise a la otra en silencio.
 */
function buildWhereClause(
  sectorId: string,
  rawState: ReturnType<typeof parseSearchParams>,
  hiddenTypeIds: readonly string[],
  companyId: string
) {
  const state = sanitizeFilters(rawState, ALLOWED_FILTERS);
  const and: Record<string, unknown>[] = [];

  // Recorte fijo: la Vista Taller no muestra OT cerradas (ticket 650)
  and.push(OPEN_WORK_ORDERS_ONLY);

  // Tipos de equipamiento ocultos para el usuario actual (ticket 690). `work_orders`
  // tiene `other_equipment_id`/`other_equipment` directos, sin necesidad de anidar.
  const equipmentCondition = visibleEquipmentTypeCondition(hiddenTypeIds);
  if (equipmentCondition) and.push(equipmentCondition);

  // ─── Búsqueda global: N° OT, N° OM y descripción de las tareas ────────────
  if (state.search) {
    const contains = { contains: state.search, mode: 'insensitive' as const };
    and.push({
      OR: [
        { order_number: contains },
        { maintenance_order_items: { some: { maintenance_orders: { order_number: contains } } } },
        { maintenance_order_items: { some: { description: contains } } },
      ],
    });
  }

  // ─── Rangos de fecha (campos directos de work_orders) ─────────────────────
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);
  if (Object.keys(dateFiltersWhere).length > 0) and.push(dateFiltersWhere);

  // ─── N° OT (texto libre sobre work_orders.order_number) ───────────────────
  const workOrderText = state.filters['work_order']?.[0];
  if (workOrderText) {
    and.push({ order_number: { contains: workOrderText, mode: 'insensitive' as const } });
  }

  // ─── Estado OT (enum, nunca null) ─────────────────────────────────────────
  const woStatusValues = state.filters['wo_status']?.filter((v): v is (typeof OPEN_WORK_ORDER_STATUSES)[number] =>
    (OPEN_WORK_ORDER_STATUSES as string[]).includes(v)
  );
  if (woStatusValues?.length) {
    and.push({ status: { in: woStatusValues } });
  }

  // ─── N° OM (texto libre sobre la OM de alguna tarea de la OT) ─────────────
  const maintenanceOrderText = state.filters['maintenance_order']?.[0];
  if (maintenanceOrderText) {
    and.push({
      maintenance_order_items: {
        some: {
          maintenance_orders: { order_number: { contains: maintenanceOrderText, mode: 'insensitive' as const } },
        },
      },
    });
  }

  // ─── Estado OM (String NOT NULL en maintenance_orders) ────────────────────
  const moStatusValues = state.filters['mo_status']?.filter((v) => v !== NULL_FILTER_VALUE);
  if (moStatusValues?.length) {
    and.push({ maintenance_order_items: { some: { maintenance_orders: { status: { in: moStatusValues } } } } });
  }

  // ─── Equipo: el id puede ser de un vehículo o de un equipamiento ──────────
  const vehicleValues = state.filters['vehicle']?.filter((v) => v !== NULL_FILTER_VALUE);
  if (vehicleValues?.length) {
    and.push({
      OR: [{ equipment_id: { in: vehicleValues } }, { other_equipment_id: { in: vehicleValues } }],
    });
  }

  // ─── Tipo de reparación: la OT tiene alguna tarea de ese tipo ─────────────
  // Los tipos viven en la pivote `maintenance_order_item_repair_types`, y
  // `repair_type_id` quedó como campo legacy con el primero. Se consultan los
  // dos: hay tareas viejas que sólo tienen el legacy cargado.
  const repairTypeValues = state.filters['repair_type'];
  if (repairTypeValues?.length) {
    const hasNull = repairTypeValues.includes(NULL_FILTER_VALUE);
    const realValues = repairTypeValues.filter((v) => v !== NULL_FILTER_VALUE);
    const orConditions: Record<string, unknown>[] = [];
    if (realValues.length > 0) {
      orConditions.push({
        maintenance_order_items: {
          some: {
            OR: [
              { repair_type_id: { in: realValues } },
              { maintenance_order_item_repair_types: { some: { repair_type_id: { in: realValues } } } },
            ],
          },
        },
      });
    }
    if (hasNull) {
      orConditions.push({
        maintenance_order_items: {
          some: { repair_type_id: null, maintenance_order_item_repair_types: { none: {} } },
        },
      });
    }
    if (orConditions.length > 0) and.push({ OR: orConditions });
  }

  // ─── Flags de tarea: "la OT tiene al menos una tarea con..." ──────────────
  // `true` = alguna tarea lo cumple; `false` = ninguna. Son atributos de la
  // tarea, no de la OT, así que a nivel OT se leen como presencia/ausencia.
  for (const flag of ['is_critical', 'is_rejected', 'is_diagnostico'] as const) {
    const values = state.filters[flag];
    if (!values?.length) continue;
    const wantsTrue = values.includes('true');
    const wantsFalse = values.includes('false');
    if (wantsTrue && wantsFalse) continue; // ambos = sin recorte
    if (wantsTrue) and.push({ maintenance_order_items: { some: { [flag]: true } } });
    else if (wantsFalse) and.push({ maintenance_order_items: { none: { [flag]: true } } });
  }

  return withCompany({ sector_id: sectorId, AND: and }, companyId);
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getWorkshopSectorWorkOrdersPaginated(sectorId: string, searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    throw new Error('No tenés permiso para ver la Vista Taller');
  }

  try {
    const state = parseSearchParams(searchParams);
    const { skip, take } = clampedPageParams(state);
    const [hiddenTypeIds, companyId] = await Promise.all([getHiddenEquipmentTypeIds(), getActiveCompanyId()]);
    const where = buildWhereClause(sectorId, state, hiddenTypeIds, companyId);

    // Multi-sort: solo campos válidos
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
      }
    }

    // Por defecto: primero las que están dentro del taller (in_progress, paused
    // van antes que pending por el orden del enum), después por inicio planificado
    const safeOrderBy: Record<string, unknown>[] = [
      ...resolvedSorts,
      { status: 'asc' as const },
      { planned_start_date: 'asc' as const },
      { id: 'asc' as const },
    ];

    const [rows, total] = await Promise.all([
      prisma.work_orders.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: SECTOR_WORK_ORDERS_SELECT,
      }),
      prisma.work_orders.count({ where }),
    ]);

    return { data: rows.map(mapWorkOrderRow), total };
  } catch (error) {
    logger.error('Error al obtener las OT del sector', { data: { error, sectorId } });
    throw new Error('Error al obtener las órdenes de trabajo del sector');
  }
}

export type WorkshopSectorWorkOrderListItem = Awaited<
  ReturnType<typeof getWorkshopSectorWorkOrdersPaginated>
>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación)
// ============================================================================

export async function getAllWorkshopSectorWorkOrdersForExport(
  sectorId: string,
  searchParams: DataTableSearchParams
): Promise<ExportResult<WorkshopSectorWorkOrderListItem[]>> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    return { ok: false, message: 'No tenés permiso para exportar la Vista Taller' };
  }

  try {
    const state = parseSearchParams(searchParams);
    const [hiddenTypeIds, companyId] = await Promise.all([getHiddenEquipmentTypeIds(), getActiveCompanyId()]);
    const where = buildWhereClause(sectorId, state, hiddenTypeIds, companyId);

    const rows = await prisma.work_orders.findMany({
      orderBy: [{ status: 'asc' as const }, { planned_start_date: 'asc' as const }, { id: 'asc' as const }],
      where,
      select: SECTOR_WORK_ORDERS_SELECT,
      take: EXPORT_MAX_ROWS + 1,
    });

    if (rows.length > EXPORT_MAX_ROWS) {
      return {
        ok: false,
        message: `La exportación supera el máximo de ${EXPORT_MAX_ROWS.toLocaleString('es-AR')} filas. Aplicá filtros para acotarla.`,
      };
    }

    return { ok: true, data: rows.map(mapWorkOrderRow) };
  } catch (error) {
    logger.error('Error al exportar las OT del sector', { data: { error, sectorId } });
    return { ok: false, message: 'Error al exportar las órdenes de trabajo del sector' };
  }
}

// ============================================================================
// TAREAS DE UNA OT (modal "Ver")
// ============================================================================

/**
 * Estado de avance de una tarea, derivado de sus trabajos de reparación.
 *
 * OJO con la fuente: `work_order_items.status` **no se usa en el flujo real**
 * (las 2182 filas de la BD están en `pending` y ninguna tiene `completed_at`).
 * Lo que el taller sí marca es `work_order_item_repairs`, un registro por tipo
 * de reparación. Por eso el avance de la tarea se calcula desde ahí y no desde
 * la columna que el nombre sugeriría.
 *
 * Las claves devueltas son las del enum `work_order_item_status`, para poder
 * rotularlas con el mismo mapa de labels/colores que el resto del módulo.
 */
function deriveTaskStatus(repairStatuses: string[]): 'pending' | 'in_progress' | 'completed' {
  if (repairStatuses.length === 0) return 'pending';
  if (repairStatuses.every((status) => status === 'completed')) return 'completed';
  if (repairStatuses.some((status) => status !== 'pending')) return 'in_progress';
  return 'pending';
}

/**
 * Tareas de una orden de trabajo, para el modal que abre la columna de acciones.
 *
 * En la tabla el estado es el de la OT; acá se ve, tarea por tarea, qué se
 * empezó y qué no — con el detalle de cada trabajo de reparación.
 */
export async function getWorkOrderTasks(workOrderId: string) {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    throw new Error('No tenés permiso para ver las tareas de la orden de trabajo');
  }

  try {
    const companyId = await getActiveCompanyId();
    const [workOrder, items] = await Promise.all([
      prisma.work_orders.findFirst({
        where: withCompany({ id: workOrderId }, companyId),
        select: { id: true, order_number: true, status: true },
      }),
      prisma.maintenance_order_items.findMany({
        where: { work_order_id: workOrderId, work_orders: { company_id: companyId } },
        orderBy: [{ is_critical: 'desc' }, { created_at: 'asc' }],
        select: {
          id: true,
          description: true,
          is_critical: true,
          is_rejected: true,
          is_diagnostico: true,
          rejection_reason: true,
          planned_start_date: true,
          planned_end_date: true,
          types_of_repairs: { select: { id: true, name: true } },
          maintenance_order_item_repair_types: {
            select: { types_of_repairs: { select: { id: true, name: true } } },
          },
          maintenance_orders: { select: { id: true, order_number: true, status: true } },
          work_order_items: {
            where: { work_order_id: workOrderId },
            select: {
              id: true,
              work_order_item_repairs: {
                orderBy: { created_at: 'asc' },
                select: {
                  id: true,
                  status: true,
                  technician_notes: true,
                  completed_at: true,
                  is_diagnostico: true,
                  rejection_reason: true,
                  types_of_repairs: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      workOrder,
      tasks: items.map((item) => {
        const repairs = item.work_order_items.flatMap((woItem) => woItem.work_order_item_repairs);
        const repairStatuses = repairs.map((repair) => repair.status);

        // Tipos de la tarea: los trabajos de reparación son la verdad operativa;
        // si la tarea todavía no los tiene, se cae a la pivote y luego al legacy.
        const fallbackTypes =
          item.maintenance_order_item_repair_types.length > 0
            ? item.maintenance_order_item_repair_types.map((r) => r.types_of_repairs)
            : item.types_of_repairs
              ? [item.types_of_repairs]
              : [];

        return {
          id: item.id,
          description: item.description,
          isCritical: item.is_critical ?? false,
          isRejected: item.is_rejected,
          isDiagnostico: item.is_diagnostico,
          rejectionReason: item.rejection_reason,
          plannedStartDate: item.planned_start_date,
          plannedEndDate: item.planned_end_date,
          repairTypes: repairs.length > 0 ? repairs.map((repair) => repair.types_of_repairs) : fallbackTypes,
          maintenanceOrder: item.maintenance_orders,
          taskStatus: deriveTaskStatus(repairStatuses),
          totalRepairs: repairs.length,
          completedRepairs: repairStatuses.filter((status) => status === 'completed').length,
          repairs: repairs.map((repair) => ({
            id: repair.id,
            name: repair.types_of_repairs?.name ?? null,
            status: repair.status,
            technicianNotes: repair.technician_notes,
            completedAt: repair.completed_at,
            isDiagnostico: repair.is_diagnostico,
            rejectionReason: repair.rejection_reason,
          })),
        };
      }),
    };
  } catch (error) {
    logger.error('Error al obtener las tareas de la OT', { data: { error, workOrderId } });
    throw new Error('Error al obtener las tareas de la orden de trabajo');
  }
}

export type WorkOrderTasksResult = Awaited<ReturnType<typeof getWorkOrderTasks>>;
export type WorkOrderTaskItem = WorkOrderTasksResult['tasks'][number];

// ============================================================================
// SINGLE FACET (lazy-load individual)
// ============================================================================

/**
 * Opciones y counts para UN SOLO filtro facetado, con cross-filtering.
 * Cada filtro llama a esta función al abrirse (lazy-load on-demand).
 *
 * Todos los counts son de **órdenes de trabajo**, nunca de tareas: si una OT
 * tiene tres tareas críticas, suma 1 al filtro "Crítica", no 3.
 */
export async function getWorkshopSectorWorkOrdersSingleFacet(
  columnId: string,
  sectorId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) return null;

  const parsedState = parseSearchParams(searchParams || {});
  const [hiddenTypeIds, companyId] = await Promise.all([getHiddenEquipmentTypeIds(), getActiveCompanyId()]);

  /** Construye el WHERE excluyendo el filtro de la columna propia (cross-filter). */
  function crossWhere(excludeColumn: string) {
    return buildWhereClause(sectorId, withoutOwnFilter(parsedState, excludeColumn), hiddenTypeIds, companyId);
  }

  try {
    const where = crossWhere(columnId);

    // ── Estado OT (enum directo de work_orders) ──
    if (columnId === 'wo_status') {
      const rows = await prisma.work_orders.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      });
      const counts = new Map<string, number>();
      for (const row of rows) counts.set(row.status, row._count._all);
      return { counts };
    }

    // ── Estado OM (via las tareas de la OT) ──
    if (columnId === 'mo_status') {
      const rows = await prisma.work_orders.findMany({
        where,
        select: { id: true, maintenance_order_items: { select: { maintenance_orders: { select: { status: true } } } } },
      });
      const counts = new Map<string, number>();
      for (const row of rows) {
        const statuses = new Set(row.maintenance_order_items.map((i) => i.maintenance_orders?.status).filter(Boolean));
        for (const status of statuses) {
          if (status) counts.set(status, (counts.get(status) ?? 0) + 1);
        }
      }
      return { counts };
    }

    // ── Equipo (vehículo o equipamiento de la OT) ──
    if (columnId === 'vehicle') {
      const rows = await prisma.work_orders.findMany({
        where,
        select: {
          vehicles: { select: { id: true, domain: true, serie: true, intern_number: true } },
          other_equipment: { select: { id: true, serial_number: true, intern_number: true } },
        },
      });
      const counts = new Map<string, number>();
      const optionsById = new Map<string, string>();
      for (const row of rows) {
        if (row.vehicles) {
          counts.set(row.vehicles.id, (counts.get(row.vehicles.id) ?? 0) + 1);
          optionsById.set(
            row.vehicles.id,
            [
              row.vehicles.domain,
              row.vehicles.serie,
              row.vehicles.intern_number ? `(${row.vehicles.intern_number})` : '',
            ]
              .filter(Boolean)
              .join(' ')
          );
        } else if (row.other_equipment) {
          counts.set(row.other_equipment.id, (counts.get(row.other_equipment.id) ?? 0) + 1);
          optionsById.set(
            row.other_equipment.id,
            [
              row.other_equipment.serial_number,
              row.other_equipment.intern_number ? `(${row.other_equipment.intern_number})` : '',
            ]
              .filter(Boolean)
              .join(' ')
          );
        } else {
          counts.set(NULL_FILTER_VALUE, (counts.get(NULL_FILTER_VALUE) ?? 0) + 1);
        }
      }
      const resolvedOptions = Array.from(optionsById.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
      return { counts, resolvedOptions };
    }

    // ── Tipo de reparación (la OT tiene alguna tarea de ese tipo) ──
    if (columnId === 'repair_type') {
      const rows = await prisma.work_orders.findMany({
        where,
        select: {
          id: true,
          maintenance_order_items: {
            select: {
              repair_type_id: true,
              types_of_repairs: { select: { id: true, name: true } },
              maintenance_order_item_repair_types: {
                select: { types_of_repairs: { select: { id: true, name: true } } },
              },
            },
          },
        },
      });
      const counts = new Map<string, number>();
      const optionsById = new Map<string, string | null>();
      for (const row of rows) {
        const typeIds = new Set<string>();
        let hasUntyped = false;
        for (const item of row.maintenance_order_items) {
          // Unión de pivote + legacy, el mismo criterio que usa el WHERE del filtro
          const itemTypes = [
            ...item.maintenance_order_item_repair_types.map((r) => r.types_of_repairs),
            ...(item.types_of_repairs ? [item.types_of_repairs] : []),
          ];
          if (itemTypes.length === 0) hasUntyped = true;
          for (const type of itemTypes) {
            if (!type) continue;
            typeIds.add(type.id);
            optionsById.set(type.id, type.name);
          }
        }
        for (const id of typeIds) counts.set(id, (counts.get(id) ?? 0) + 1);
        if (hasUntyped) counts.set(NULL_FILTER_VALUE, (counts.get(NULL_FILTER_VALUE) ?? 0) + 1);
      }
      const resolvedOptions = Array.from(optionsById.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
      return { counts, resolvedOptions };
    }

    // ── Flags de tarea: cuántas OT tienen (y cuántas no) alguna tarea así ──
    if (columnId === 'is_critical' || columnId === 'is_rejected' || columnId === 'is_diagnostico') {
      const [withFlag, withoutFlag] = await Promise.all([
        prisma.work_orders.count({
          where: { AND: [where, { maintenance_order_items: { some: { [columnId]: true } } }] },
        }),
        prisma.work_orders.count({
          where: { AND: [where, { maintenance_order_items: { none: { [columnId]: true } } }] },
        }),
      ]);
      const counts = new Map<string, number>();
      if (withFlag > 0) counts.set('true', withFlag);
      if (withoutFlag > 0) counts.set('false', withoutFlag);
      return { counts };
    }

    logger.warn('getWorkshopSectorWorkOrdersSingleFacet: columnId desconocido', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error al obtener facet individual de las OT del sector', { data: { error, columnId, sectorId } });
    return { counts: new Map() };
  }
}
