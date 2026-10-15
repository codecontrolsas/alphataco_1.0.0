import 'server-only';

import {
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import { prisma } from '@/shared/lib/prisma';
import { REMIT_NUMBERS_SELECT, remitNumberContainsWhere } from '../../remitManager/lib/remit-numbers';
import { sanitizeFilters } from '@/shared/lib/table-filters';

/** Tipo del cliente transaccional de Prisma (evita TS2589 con Omit<typeof prisma, ...>) */
export type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de dailyreportrows que se pueden ordenar server-side */
export const VALID_SORT_FIELDS = new Set([
  'status',
  'type_service',
  'working_day',
  'start_time',
  'end_time',
  'description',
  'completed_day',
  'completed_night',
  'created_at',
  'updated_at',
]);

/** Mapping de columnId a ordenamiento Prisma para FKs */
export const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  customer: (dir) => ({ customers: { name: dir } }),
  service: (dir) => ({ customer_services: { service_name: dir } }),
  item: (dir) => ({ service_items: { item_name: dir } }),
  sector: (dir) => ({ service_sectors: { sectors: { name: dir } } }),
  area: (dir) => ({ service_areas: { areas_cliente: { descripcion_corta: dir } } }),
};

/** Columnas con filtro de rango de fechas */
export const DATE_RANGE_COLUMNS: string[] = [];

/** Columnas de texto libre */
export const TEXT_COLUMNS = ['description', 'cancel_reason', 'working_day'];

/** Campos de texto propios de la fila que entran en la búsqueda global (los remitos se suman aparte). */
const SEARCH_FIELDS = ['description', 'cancel_reason', 'working_day'];

/** Columnas manejadas manualmente (no pasar a buildFiltersWhere) */
export const MANUALLY_HANDLED = [
  'customer',
  'service',
  'item',
  'sector',
  'area',
  'completed_day',
  'completed_night',
  'employees',
  'equipment',
  'customer_equipment',
  // Remitos: viven en la tabla `remitos` (1:N), se filtran con `some`
  'remit_number',
  ...TEXT_COLUMNS,
];

/** Mapping de columnId → campo real en Prisma (para enums/directos) */
export const COLUMN_MAP: Record<string, string> = {
  status: 'status',
  type_service: 'type_service',
};

/**
 * Únicas claves de URL que filtran el detalle. Cualquier otra (`daily_report_id`, `dailyreport`, un campo
 * ajeno…) se descarta antes de armar el `where`: no puede pisar el perímetro ni filtrar por columnas no expuestas.
 */
const ALLOWED_FILTER_KEYS: ReadonlySet<string> = new Set([...Object.keys(COLUMN_MAP), ...MANUALLY_HANDLED]);

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/**
 * WHERE compartido por el listado, el export y los facets del detalle.
 *
 * Perímetro: el parte se acota SIEMPRE por `dailyreport.company_id`; sin eso, el id de un
 * parte de otra empresa devolvería sus filas (no hay RLS con Prisma).
 */
export function buildWhereClause(
  dailyReportId: string,
  rawState: ReturnType<typeof parseSearchParams>,
  companyId: string
) {
  const state = sanitizeFilters(rawState, ALLOWED_FILTER_KEYS);
  // La búsqueda global también encuentra la línea por cualquiera de sus remitos
  const fieldsSearch = buildSearchWhere(state.search, SEARCH_FIELDS);
  const searchWhere = state.search
    ? { OR: [...(fieldsSearch.OR ?? []), remitNumberContainsWhere(state.search)] }
    : {};

  const filtersWhere = buildFiltersWhere(state.filters, COLUMN_MAP, {
    exclude: [...MANUALLY_HANDLED, ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`])],
  });

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_COLUMNS);

  // Filtros manuales para FK y booleanos
  const manualFilters: Record<string, unknown>[] = [];

  // customer (FK UUID nullable)
  const customerValues = state.filters['customer'];
  if (customerValues?.length) {
    const hasNull = customerValues.includes(NULL_FILTER_VALUE);
    const realValues = customerValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      manualFilters.push({ OR: [{ customer_id: { in: realValues } }, { customer_id: null }] });
    } else if (hasNull) {
      manualFilters.push({ customer_id: null });
    } else {
      manualFilters.push({ customer_id: realValues.length === 1 ? realValues[0] : { in: realValues } });
    }
  }

  // service (FK UUID nullable)
  const serviceValues = state.filters['service'];
  if (serviceValues?.length) {
    const hasNull = serviceValues.includes(NULL_FILTER_VALUE);
    const realValues = serviceValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      manualFilters.push({ OR: [{ service_id: { in: realValues } }, { service_id: null }] });
    } else if (hasNull) {
      manualFilters.push({ service_id: null });
    } else {
      manualFilters.push({ service_id: realValues.length === 1 ? realValues[0] : { in: realValues } });
    }
  }

  // item (FK UUID nullable)
  const itemValues = state.filters['item'];
  if (itemValues?.length) {
    const hasNull = itemValues.includes(NULL_FILTER_VALUE);
    const realValues = itemValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      manualFilters.push({ OR: [{ item_id: { in: realValues } }, { item_id: null }] });
    } else if (hasNull) {
      manualFilters.push({ item_id: null });
    } else {
      manualFilters.push({ item_id: realValues.length === 1 ? realValues[0] : { in: realValues } });
    }
  }

  // sector (FK UUID nullable → via service_sectors pivot)
  const sectorValues = state.filters['sector'];
  if (sectorValues?.length) {
    const hasNull = sectorValues.includes(NULL_FILTER_VALUE);
    const realValues = sectorValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      manualFilters.push({
        OR: [{ service_sectors: { sectors: { id: { in: realValues } } } }, { sector_service_id: null }],
      });
    } else if (hasNull) {
      manualFilters.push({ sector_service_id: null });
    } else {
      manualFilters.push({
        service_sectors: {
          sectors: { id: realValues.length === 1 ? realValues[0] : { in: realValues } },
        },
      });
    }
  }

  // area (FK UUID nullable → via service_areas pivot)
  const areaValues = state.filters['area'];
  if (areaValues?.length) {
    const hasNull = areaValues.includes(NULL_FILTER_VALUE);
    const realValues = areaValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      manualFilters.push({
        OR: [{ service_areas: { areas_cliente: { id: { in: realValues } } } }, { areas_service_id: null }],
      });
    } else if (hasNull) {
      manualFilters.push({ areas_service_id: null });
    } else {
      manualFilters.push({
        service_areas: {
          areas_cliente: { id: realValues.length === 1 ? realValues[0] : { in: realValues } },
        },
      });
    }
  }

  // completed_day (booleano nullable)
  const completedDayValues = state.filters['completed_day'];
  if (completedDayValues?.length) {
    const boolVal = completedDayValues[0] === 'true';
    manualFilters.push({ completed_day: boolVal });
  }

  // completed_night (booleano nullable)
  const completedNightValues = state.filters['completed_night'];
  if (completedNightValues?.length) {
    const boolVal = completedNightValues[0] === 'true';
    manualFilters.push({ completed_night: boolVal });
  }

  // employees (M:M via dailyreportemployeerelations.employee_id)
  const employeeValues = state.filters['employees'];
  if (employeeValues?.length) {
    const hasNull = employeeValues.includes(NULL_FILTER_VALUE);
    const realValues = employeeValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      manualFilters.push({
        OR: [
          { dailyreportemployeerelations: { some: { employee_id: { in: realValues } } } },
          { dailyreportemployeerelations: { none: {} } },
        ],
      });
    } else if (hasNull) {
      manualFilters.push({ dailyreportemployeerelations: { none: {} } });
    } else {
      manualFilters.push({
        dailyreportemployeerelations: { some: { employee_id: { in: realValues } } },
      });
    }
  }

  // equipment (M:M mixto: vehicles via equipment_id + other_equipment via other_equipment_id)
  const equipmentValues = state.filters['equipment'];
  if (equipmentValues?.length) {
    const hasNull = equipmentValues.includes(NULL_FILTER_VALUE);
    const realValues = equipmentValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      manualFilters.push({
        OR: [
          { dailyreportequipmentrelations: { some: { equipment_id: { in: realValues } } } },
          { dailyreportequipmentrelations: { some: { other_equipment_id: { in: realValues } } } },
          { dailyreportequipmentrelations: { none: {} } },
        ],
      });
    } else if (hasNull) {
      manualFilters.push({ dailyreportequipmentrelations: { none: {} } });
    } else {
      manualFilters.push({
        OR: [
          { dailyreportequipmentrelations: { some: { equipment_id: { in: realValues } } } },
          { dailyreportequipmentrelations: { some: { other_equipment_id: { in: realValues } } } },
        ],
      });
    }
  }

  // customer_equipment (M:M via dailyreport_customer_equipment_relations.customer_equipment_id)
  const customerEquipmentValues = state.filters['customer_equipment'];
  if (customerEquipmentValues?.length) {
    const hasNull = customerEquipmentValues.includes(NULL_FILTER_VALUE);
    const realValues = customerEquipmentValues.filter((v) => v !== NULL_FILTER_VALUE);
    if (hasNull && realValues.length > 0) {
      manualFilters.push({
        OR: [
          { dailyreport_customer_equipment_relations: { some: { customer_equipment_id: { in: realValues } } } },
          { dailyreport_customer_equipment_relations: { none: {} } },
        ],
      });
    } else if (hasNull) {
      manualFilters.push({ dailyreport_customer_equipment_relations: { none: {} } });
    } else {
      manualFilters.push({
        dailyreport_customer_equipment_relations: {
          some: { customer_equipment_id: { in: realValues } },
        },
      });
    }
  }

  // remit_number (texto libre sobre los remitos de la línea)
  const remitNumberValue = state.filters['remit_number']?.[0];
  if (remitNumberValue) manualFilters.push(remitNumberContainsWhere(remitNumberValue));

  // `AND` de `buildFiltersWhere` (casos mixtos con null): se fusiona con los filtros manuales.
  const { AND: filtersAnd, ...filtersRest } = filtersWhere as { AND?: Record<string, unknown>[] };

  // El perímetro (parte + empresa) va dentro de `AND` y el resto de los fragmentos se esparcen ANTES:
  // ninguna clave de filtro puede pisarlo.
  const where: Record<string, unknown> = {
    ...searchWhere,
    ...filtersRest,
    ...textFiltersWhere,
    AND: [
      { daily_report_id: dailyReportId },
      { dailyreport: { company_id: companyId } },
      ...(filtersAnd ?? []),
      ...manualFilters,
    ],
  };

  return where;
}

// ============================================================================
// SELECT COMÚN
// ============================================================================

/**
 * Select de Prisma de las filas del parte (listado paginado y export).
 * Ya no trae `employees_diagram`: ninguna columna del detalle lo usa (los desvíos salen de la función SQL).
 */
export function buildRowSelect() {
  return {
    id: true,
    daily_report_id: true,
    customer_id: true,
    service_id: true,
    item_id: true,
    start_time: true,
    end_time: true,
    description: true,
    status: true,
    working_day: true,
    document_path: true,
    sector_service_id: true,
    areas_service_id: true,
    remitos: REMIT_NUMBERS_SELECT,
    cancel_reason: true,
    type_service: true,
    completed_day: true,
    completed_night: true,
    preparte_id: true,
    last_comercial_edit_at: true,
    created_at: true,
    updated_at: true,
    // Relaciones directas
    customers: {
      select: { id: true, name: true },
    },
    customer_services: {
      select: { id: true, service_name: true },
    },
    service_items: {
      select: { id: true, item_name: true },
    },
    service_sectors: {
      select: {
        id: true,
        sectors: {
          select: { id: true, name: true },
        },
      },
    },
    service_areas: {
      select: {
        id: true,
        areas_cliente: {
          select: { id: true, descripcion_corta: true },
        },
      },
    },
    preparte: {
      select: { id: true },
    },
    // Relaciones de recursos
    dailyreportemployeerelations: {
      select: {
        id: true,
        role: true,
        employee_id: true,
        employees: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            file: true,
          },
        },
      },
    },
    dailyreportequipmentrelations: {
      select: {
        id: true,
        equipment_id: true,
        other_equipment_id: true,
        vehicles: {
          select: {
            id: true,
            domain: true,
            intern_number: true,
            condition: true,
            brand_vehicles: {
              select: { name: true },
            },
          },
        },
        other_equipment: {
          select: {
            id: true,
            intern_number: true,
            serial_number: true,
          },
        },
      },
    },
    dailyreport_customer_equipment_relations: {
      select: {
        id: true,
        customer_equipment_id: true,
        equipos_clientes: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    },
  } as const;
}

// El perímetro de empresa vive en ./perimeter; se re-exporta para no romper a los importadores existentes.
export {
  assertDailyReportInCompany,
  assertRowInCompany,
  assertRowResourcesInCompany,
  filterRowsInCompany,
  type RowResourceRefs,
} from './perimeter';
