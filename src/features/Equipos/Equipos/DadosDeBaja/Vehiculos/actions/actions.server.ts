'use server';

import {
  VEHICLE_EXPORT_MAX_ROWS,
  createVehicleListQuery,
  resolveVehicleOrderBy,
  vehicleExportTooLargeMessage,
  withNumericPrice,
} from '@/features/Equipos/lib/vehicle-list-shared';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import type { SingleFacetResult } from '@/shared/lib/table-list-query';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('InactiveVehicles/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Permiso de la pestaña "Dados de baja" (módulo `equipos`, mismo slug que usa `EquiposComponent`). */
const MODULE_SLUG = 'equipos';
const TAB_SLUG = 'inactive';

/**
 * Campos directos de vehicles que se pueden ordenar server-side.
 * Solo los campos directos + IDs de FK que tenemos en VEHICLE_FK_SORT_MAP.
 */
const VALID_SORT_FIELDS: ReadonlySet<string> = new Set([
  'domain',
  'intern_number',
  'chassis',
  'engine',
  'serie',
  'year',
  'kilometer',
  'engine_hours',
  'condition',
  'status',
  'cost_type',
  'currency',
  'type_of_contract',
  'contract_number',
  'reason_for_termination',
  'termination_date',
  'contract_expiration_date',
  'contract_start_date',
  'price',
  'created_at',
  // FK columns (sorted by relation name)
  'type',
  'sub_type',
  'brand',
  'model',
  'owner',
  'sector',
  'cost_center',
]);

/** Consulta del listado de DADOS DE BAJA (`is_active = false`). */
const inactiveVehicleQuery = createVehicleListQuery({
  isActive: false,
  searchColumns: ['domain', 'intern_number', 'chassis', 'engine', 'serie'],
  enumColumns: ['condition', 'status', 'cost_type', 'currency', 'type_of_contract', 'reason_for_termination'],
  textColumns: [
    'domain',
    'intern_number',
    'chassis',
    'engine',
    'serie',
    'contract_number',
    'year',
    'kilometer',
    'engine_hours',
    'price',
  ],
  dateColumns: ['termination_date', 'contract_expiration_date', 'contract_start_date', 'created_at'],
  withFleetExtras: false,
});

/**
 * Select común con todas las relaciones resueltas (sin `picture`: ninguna columna lo usa).
 * brand y model son Int (number), se pueden serializar directamente en RSC.
 */
const INACTIVE_VEHICLE_SELECT = {
  id: true,
  domain: true,
  intern_number: true,
  chassis: true,
  engine: true,
  serie: true,
  year: true,
  kilometer: true,
  engine_hours: true,
  condition: true,
  status: true,
  cost_type: true,
  currency: true,
  price: true,
  type_of_contract: true,
  contract_number: true,
  contract_expiration_date: true,
  contract_start_date: true,
  reason_for_termination: true,
  termination_date: true,
  created_at: true,
  // Raw Int FK scalars — seleccionados para usar en filterFn.
  brand: true,
  model: true,
  // FK relations
  type_vehicles_typeTotype: { select: { id: true, name: true } },
  sub_type: { select: { id: true, name: true } },
  brand_vehicles: { select: { name: true } },
  model_vehicles: { select: { name: true } },
  equipment_owners: { select: { id: true, name: true } },
  hierarchy: { select: { id: true, name: true } },
  cost_center: { select: { id: true, name: true } },
  // M:M relation
  contractor_equipment: {
    select: {
      customers: { select: { id: true, name: true } },
    },
  },
} as const;

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getInactiveVehiclesPaginated(searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    throw new Error('No tenés permiso para ver los vehículos dados de baja');
  }

  const companyId = await getActiveCompanyId();

  try {
    const state = inactiveVehicleQuery.parseState(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = await inactiveVehicleQuery.buildWhere(companyId, state);

    // Multi-sort, solo campos válidos; las bajas más recientes primero
    const orderBy = resolveVehicleOrderBy(state.sorting, VALID_SORT_FIELDS, [
      { termination_date: 'desc' },
      { created_at: 'desc' },
    ]);

    const [rawData, total] = await Promise.all([
      prisma.vehicles.findMany({ skip, take, orderBy, where, select: INACTIVE_VEHICLE_SELECT }),
      prisma.vehicles.count({ where }),
    ]);

    return { data: rawData.map(withNumericPrice), total };
  } catch (error) {
    logger.error('Error al obtener vehículos dados de baja paginados', { data: { error } });
    throw new Error('Error al obtener los vehículos dados de baja');
  }
}

export type InactiveVehicleListItem = Awaited<ReturnType<typeof getInactiveVehiclesPaginated>>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación, con tope)
// ============================================================================

/**
 * Filas del export con los mismos filtros de la tabla. Tope de `VEHICLE_EXPORT_MAX_ROWS`: si se supera, devuelve
 * `{ ok: false, message }` (Next enmascara el mensaje de un error lanzado). El cliente lo abre con `unwrapExportResult`.
 */
export async function getAllInactiveVehiclesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<InactiveVehicleListItem[]>> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    return { ok: false, message: 'No tenés permiso para exportar los vehículos dados de baja' };
  }

  const companyId = await getActiveCompanyId();

  try {
    const state = inactiveVehicleQuery.parseState(searchParams);
    const where = await inactiveVehicleQuery.buildWhere(companyId, state);

    const rawData = await prisma.vehicles.findMany({
      orderBy: [{ termination_date: 'desc' }, { created_at: 'desc' }, { id: 'asc' }],
      where,
      select: INACTIVE_VEHICLE_SELECT,
      take: VEHICLE_EXPORT_MAX_ROWS + 1,
    });

    if (rawData.length > VEHICLE_EXPORT_MAX_ROWS) {
      return { ok: false, message: vehicleExportTooLargeMessage('vehículos dados de baja') };
    }

    return { ok: true, data: rawData.map(withNumericPrice) };
  } catch (error) {
    logger.error('Error al exportar vehículos dados de baja', { data: { error } });
    return { ok: false, message: 'Error al exportar los vehículos dados de baja' };
  }
}

// ============================================================================
// FACETS — SINGLE COLUMN (lazy-load, on-demand)
// ============================================================================

/**
 * Retorna facets para UNA sola columna con cross-filtering.
 * Solo incluye registros inactivos (is_active = false, type_of_vehicle = 1).
 * Esta función se invoca desde el cliente cuando el usuario abre el popover de un filtro.
 */
export async function getInactiveVehicleSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<SingleFacetResult> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) return null;

  const companyId = await getActiveCompanyId();

  try {
    return await inactiveVehicleQuery.getFacet(companyId, columnId, searchParams);
  } catch (error) {
    logger.error('Error al obtener facet de vehículo dado de baja', { data: { error, columnId } });
    return null;
  }
}
