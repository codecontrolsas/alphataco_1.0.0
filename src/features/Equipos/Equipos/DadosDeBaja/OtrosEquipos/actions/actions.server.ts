'use server';

import {
  getOtherEquipmentFacet,
  type OtherEquipmentFacet,
} from '@/features/Equipos/OtherEquipment/list/lib/other-equipment-facets';
import {
  buildOtherEquipmentOrderBy,
  buildOtherEquipmentWhere,
  parseOtherEquipmentState,
  withoutColumnFilter,
  type OtherEquipmentListConfig,
} from '@/features/Equipos/OtherEquipment/list/lib/other-equipment-where';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('Equipos/DadosDeBaja/OtrosEquipos/actions.server');

// ============================================================================
// CONSTANTS
// ============================================================================

/** Tope de filas del export: por encima se pide acotar con filtros. */
const MAX_EXPORT_ROWS = 10_000;

/** Subtab "Dados de Baja" del módulo Equipos: de ahí sale el permiso `view` de todas las acciones. */
const PERMISSION = { module: 'equipos', tab: 'inactive' } as const;

/** Campos directos de other_equipment que se pueden ordenar server-side */
const VALID_SORT_FIELDS: ReadonlySet<string> = new Set([
  'serial_number',
  'intern_number',
  'year',
  'condition',
  'status',
  'horometer',
  'manufacturer_plate',
  'composition',
  'invoice_number',
  'initial_value',
  'currency',
  'purchase_date',
  'cost_type',
  'reason_for_termination',
  'termination_date',
  'created_at',
  // FK columns (sorted by relation name)
  'type',
  'sub_type',
  'brand',
  'model',
  'linked_vehicle',
  'owner',
  'sector',
  'cost_center',
]);

/** Columnas que filtra el listado de dados de baja (solo equipos con `is_active = false`). */
const LIST_CONFIG: OtherEquipmentListConfig = {
  isActive: false,
  enumColumns: ['condition', 'status', 'cost_type', 'currency', 'reason_for_termination'],
  textColumns: ['serial_number', 'intern_number', 'manufacturer_plate', 'invoice_number', 'composition', 'year'],
  decimalColumns: ['horometer', 'initial_value'],
  dateColumns: ['purchase_date', 'created_at', 'termination_date'],
  booleanColumns: [],
  validSortFields: VALID_SORT_FIELDS,
};

/**
 * Select común con todas las relaciones resueltas.
 * brand_id y model_id son Int (number), se pueden serializar directamente en RSC.
 */
const INACTIVE_OTHER_EQUIPMENT_SELECT = {
  id: true,
  serial_number: true,
  intern_number: true,
  year: true,
  condition: true,
  status: true,
  horometer: true,
  manufacturer_plate: true,
  composition: true,
  invoice_number: true,
  initial_value: true,
  currency: true,
  purchase_date: true,
  cost_type: true,
  reason_for_termination: true,
  termination_date: true,
  created_at: true,
  // Raw Int FK IDs — seleccionados explícitamente para usar en filterFn.
  brand_id: true,
  model_id: true,
  // FK relations
  type: { select: { id: true, name: true } },
  sub_type: { select: { id: true, name: true } },
  brand_vehicles: { select: { name: true } },
  model_vehicles: { select: { name: true } },
  equipment_owners: { select: { id: true, name: true } },
  hierarchy: { select: { id: true, name: true } },
  cost_center: { select: { id: true, name: true } },
  vehicles: { select: { id: true, domain: true } },
  // M:M relation
  contractor_other_equipment: {
    select: {
      customers: { select: { id: true, name: true } },
    },
  },
} as const;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

async function canViewInactiveOtherEquipment() {
  return checkPermissionServer(PERMISSION.module, PERMISSION.tab, 'view');
}

/** `horometer` e `initial_value` son Decimal: no se pueden pasar a un Client Component. Se entregan como número. */
function withNumericDecimals<
  T extends { horometer: { toString(): string } | null; initial_value: { toString(): string } | null },
>(equipment: T) {
  return {
    ...equipment,
    horometer: equipment.horometer === null ? null : Number(equipment.horometer),
    initial_value: equipment.initial_value === null ? null : Number(equipment.initial_value),
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getInactiveOtherEquipmentPaginated(searchParams: DataTableSearchParams) {
  try {
    if (!(await canViewInactiveOtherEquipment())) throw new Error('Sin permiso para ver los equipos dados de baja');
    const companyId = await getActiveCompanyId();

    const state = parseOtherEquipmentState(searchParams, LIST_CONFIG);
    const { skip, take } = clampedPageParams(state);
    const where = buildOtherEquipmentWhere(companyId, state, LIST_CONFIG);
    const orderBy = [
      ...buildOtherEquipmentOrderBy(state.sorting, VALID_SORT_FIELDS),
      { termination_date: 'desc' as const },
      { created_at: 'desc' as const },
    ];

    const [rawData, total] = await Promise.all([
      prisma.other_equipment.findMany({ skip, take, orderBy, where, select: INACTIVE_OTHER_EQUIPMENT_SELECT }),
      prisma.other_equipment.count({ where }),
    ]);

    return { data: rawData.map(withNumericDecimals), total };
  } catch (error) {
    logger.error('Error al obtener equipos dados de baja paginados', { data: { error } });
    throw new Error('Error al obtener los equipos dados de baja');
  }
}

export type InactiveOtherEquipmentListItem = Awaited<
  ReturnType<typeof getInactiveOtherEquipmentPaginated>
>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación, con tope)
// ============================================================================

export async function getAllInactiveOtherEquipmentForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<InactiveOtherEquipmentListItem[]>> {
  try {
    if (!(await canViewInactiveOtherEquipment())) {
      return { ok: false, message: 'No tenés permiso para exportar los equipos dados de baja.' };
    }
    const companyId = await getActiveCompanyId();

    const state = parseOtherEquipmentState(searchParams, LIST_CONFIG);
    const where = buildOtherEquipmentWhere(companyId, state, LIST_CONFIG);

    // Se piden MAX + 1 filas: alcanza para saber si se superó el tope sin traer la tabla entera.
    const rows = await prisma.other_equipment.findMany({
      orderBy: [{ termination_date: 'desc' }, { created_at: 'desc' }],
      where,
      take: MAX_EXPORT_ROWS + 1,
      select: INACTIVE_OTHER_EQUIPMENT_SELECT,
    });

    if (rows.length > MAX_EXPORT_ROWS) {
      return {
        ok: false,
        message: `La exportación supera el máximo de ${MAX_EXPORT_ROWS.toLocaleString('es-AR')} filas. Aplicá filtros para acotarla.`,
      };
    }

    return { ok: true, data: rows.map(withNumericDecimals) };
  } catch (error) {
    logger.error('Error al exportar equipos dados de baja', { data: { error } });
    return { ok: false, message: 'Error al exportar los equipos dados de baja' };
  }
}

// ============================================================================
// FACETS — SINGLE COLUMN (lazy-load, on-demand)
// ============================================================================

/**
 * Opciones y conteos de UNA columna con filtro cruzado (los conteos excluyen el filtro propio de la columna).
 * Solo incluye registros inactivos. Se invoca cuando el usuario abre el popover de un filtro.
 */
export async function getInactiveOtherEquipmentSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<OtherEquipmentFacet | null> {
  try {
    if (!(await canViewInactiveOtherEquipment())) return null;
    const companyId = await getActiveCompanyId();

    const state = withoutColumnFilter(parseOtherEquipmentState(searchParams, LIST_CONFIG), columnId);
    const where = buildOtherEquipmentWhere(companyId, state, LIST_CONFIG);

    const facet = await getOtherEquipmentFacet(columnId, where, LIST_CONFIG.enumColumns, LIST_CONFIG.booleanColumns);
    if (!facet) logger.warn('getInactiveOtherEquipmentSingleFacet: columnId no reconocido', { data: { columnId } });
    return facet;
  } catch (error) {
    logger.error('Error al obtener facet de equipo dado de baja', { data: { error, columnId } });
    return null;
  }
}
