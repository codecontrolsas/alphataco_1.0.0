'use server';

import {
  VEHICLE_EXPORT_MAX_ROWS,
  createVehicleListQuery,
  resolveVehicleOrderBy,
  vehicleExportTooLargeMessage,
  withNumericPrice,
} from '@/features/Equipos/lib/vehicle-list-shared';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { VEHICLE_SELECT } from '@/shared/prisma-selects/vehicle-select';

const logger = new Logger('Vehicles/list/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Permiso de la pestaña "Vehículos" (módulo `equipos`, mismo slug que usa `EquiposComponent`). */
const MODULE_SLUG = 'equipos';
const TAB_SLUG = 'vehicles';

/** Campos directos de vehicles que se pueden ordenar server-side */
const VALID_SORT_FIELDS: ReadonlySet<string> = new Set([
  'domain',
  'chassis',
  'engine',
  'serie',
  'intern_number',
  'year',
  'condition',
  'status',
  'kilometer',
  'engine_hours',
  'type_of_contract',
  'contract_expiration_date',
  'contract_start_date',
  'contract_number',
  'currency',
  'price',
  'cost_type',
  'termination_date',
  'reason_for_termination',
  'created_at',
  'has_certification',
  'certification_expiration_date',
  'certification_number',
  // FK columns (sorted by relation name)
  'type',
  'sub_type',
  'brand',
  'model',
  'owner',
  'sector',
  'cost_center',
  'type_of_vehicle',
  // Checklist (ticket 685) — cantidad ordenable via aggregate _count.
  // La fecha del ultimo checklist NO se agrega aqui: Prisma no soporta ordenar
  // por MAX() de un campo de una relacion 1:N sin SQL crudo (ver `enableSorting: false` en columns.tsx).
  'checklist_count',
]);

/**
 * Consulta del listado ACTIVO. `termination_date` y `reason_for_termination` no filtran acá: con `is_active: true`
 * son siempre null (solo tienen sentido en el listado de dados de baja).
 */
const vehicleListQuery = createVehicleListQuery({
  isActive: true,
  searchColumns: ['domain', 'chassis', 'intern_number', 'engine'],
  enumColumns: ['condition', 'status', 'type_of_contract', 'cost_type', 'currency'],
  textColumns: [
    'domain',
    'chassis',
    'engine',
    'serie',
    'intern_number',
    'contract_number',
    'year',
    'kilometer',
    'engine_hours',
    'price',
    'certification_number',
  ],
  dateColumns: ['contract_expiration_date', 'contract_start_date', 'created_at', 'certification_expiration_date'],
  withFleetExtras: true,
});

/**
 * Select del listado: el de vehículos SIN `picture` (data URL base64 que pesaba en cada fila y en el export y
 * que ninguna columna usa), más los datos de certificación y de checklist (ticket 685: cantidad y fecha del
 * último). Se arma acá y no se toca VEHICLE_SELECT porque lo comparten la API externa y Mantenimiento.
 */
const { picture: _picture, ...VEHICLE_SELECT_WITHOUT_PICTURE } = VEHICLE_SELECT;

const VEHICLE_LIST_SELECT = {
  ...VEHICLE_SELECT_WITHOUT_PICTURE,
  has_certification: true,
  certification_expiration_date: true,
  certification_number: true,
  _count: { select: { checklist_answers: true } },
  checklist_answers: {
    orderBy: { created_at: 'desc' as const },
    take: 1,
    select: { created_at: true },
  },
} as const;

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getVehiclesPaginated(searchParams: DataTableSearchParams) {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    throw new Error('No tenés permiso para ver los vehículos');
  }

  const companyId = await getActiveCompanyId();

  try {
    const state = vehicleListQuery.parseState(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = await vehicleListQuery.buildWhere(companyId, state);

    // Multi-sort, solo campos válidos, desempate por dominio
    const orderBy = resolveVehicleOrderBy(state.sorting, VALID_SORT_FIELDS, [{ domain: 'asc' }]);

    const [rawData, total] = await Promise.all([
      prisma.vehicles.findMany({ skip, take, orderBy, where, select: VEHICLE_LIST_SELECT }),
      prisma.vehicles.count({ where }),
    ]);

    return { data: rawData.map(withNumericPrice), total };
  } catch (error) {
    logger.error('Error al obtener vehículos paginados', { data: { error } });
    throw new Error('Error al obtener los vehículos');
  }
}

export type VehicleListItem = Awaited<ReturnType<typeof getVehiclesPaginated>>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación, con tope)
// ============================================================================

/**
 * Filas del export con los mismos filtros de la tabla. Tope de `VEHICLE_EXPORT_MAX_ROWS`: si se supera, devuelve
 * `{ ok: false, message }` (Next enmascara el mensaje de un error lanzado). El cliente lo abre con `unwrapExportResult`.
 */
export async function getAllVehiclesForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<VehicleListItem[]>> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) {
    return { ok: false, message: 'No tenés permiso para exportar los vehículos' };
  }

  const companyId = await getActiveCompanyId();

  try {
    const state = vehicleListQuery.parseState(searchParams);
    const where = await vehicleListQuery.buildWhere(companyId, state);

    const rawData = await prisma.vehicles.findMany({
      orderBy: [{ domain: 'asc' }, { id: 'asc' }],
      where,
      select: VEHICLE_LIST_SELECT,
      take: VEHICLE_EXPORT_MAX_ROWS + 1,
    });

    if (rawData.length > VEHICLE_EXPORT_MAX_ROWS) {
      return { ok: false, message: vehicleExportTooLargeMessage('vehículos') };
    }

    return { ok: true, data: rawData.map(withNumericPrice) };
  } catch (error) {
    logger.error('Error al exportar vehículos', { data: { error } });
    return { ok: false, message: 'Error al exportar los vehículos' };
  }
}

// ============================================================================
// FACETS — SINGLE COLUMN (lazy-load, on-demand)
// ============================================================================

/**
 * Retorna facets para UNA sola columna con cross-filtering.
 * Solo incluye vehículos activos (is_active = true, type_of_vehicle = 1).
 * Esta función se invoca desde el cliente cuando el usuario abre el popover de un filtro.
 */
export async function getVehicleSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: { value: string; label: string }[];
} | null> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) return null;

  const companyId = await getActiveCompanyId();

  try {
    return await vehicleListQuery.getFacet(companyId, columnId, searchParams);
  } catch (error) {
    logger.error('Error al obtener facet de vehículo', { data: { error, columnId } });
    return null;
  }
}
