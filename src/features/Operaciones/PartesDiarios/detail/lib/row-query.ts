import 'server-only';

import { Logger } from '@/lib/logger';
import {
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import { prisma } from '@/shared/lib/prisma';
import { REMIT_NUMBERS_SELECT, remitNumberContainsWhere } from '../../remitManager/lib/remit-numbers';
import moment from 'moment';

const logger = new Logger('features/Operaciones/PartesDiarios/detail/lib');

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

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

/**
 * Construye el WHERE clause compartido entre paginated, export y facets.
 * Acepta dailyReportId para filtrar siempre al parte correspondiente.
 */
/**
 * WHERE compartido por el listado, el export y los facets del detalle.
 *
 * Perímetro: el parte se acota SIEMPRE por `dailyreport.company_id`; sin eso, el id de un
 * parte de otra empresa devolvería sus filas (no hay RLS con Prisma).
 */
export function buildWhereClause(
  dailyReportId: string,
  state: ReturnType<typeof parseSearchParams>,
  companyId: string
) {
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

  const base: Record<string, unknown> = {
    daily_report_id: dailyReportId,
    dailyreport: { company_id: companyId },
    ...searchWhere,
    ...filtersWhere,
    ...textFiltersWhere,
  };

  if (manualFilters.length > 0) {
    const existingAnd = (base.AND as Record<string, unknown>[] | undefined) ?? [];
    base.AND = [...existingAnd, ...manualFilters];
  }

  return base;
}

// ============================================================================
// SELECT COMÚN
// ============================================================================

/**
 * Construye el select de Prisma para las filas del parte.
 * reportDate se usa para filtrar employees_diagram por fecha.
 */
export function buildRowSelect(reportDate?: string) {
  const day = reportDate ? Number(moment(reportDate).format('D')) : undefined;
  const month = reportDate ? Number(moment(reportDate).format('M')) : undefined;
  const year = reportDate ? Number(moment(reportDate).format('YYYY')) : undefined;

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
            // Diagrama del día del parte para detección de desviaciones
            employees_diagram:
              day != null && month != null && year != null
                ? {
                    where: {
                      day: day,
                      month: month,
                      year: year,
                    },
                    select: {
                      id: true,
                      diagram_type_employees_diagram_diagram_typeTodiagram_type: {
                        select: {
                          id: true,
                          name: true,
                          work_active: true,
                        },
                      },
                    },
                  }
                : false,
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


// ============================================================================
// PERÍMETRO DE EMPRESA (sin RLS: cada action verifica lo que escribe)
// ============================================================================

/** Lanza si el parte diario no pertenece a la empresa indicada. */
export async function assertDailyReportInCompany(dailyReportId: string, companyId: string): Promise<void> {
  const report = await prisma.dailyreport.findFirst({
    where: { id: dailyReportId, company_id: companyId },
    select: { id: true },
  });
  if (!report) {
    throw new Error('El parte diario no existe o no pertenece a la empresa activa.');
  }
}

/** Lanza si la línea no cuelga de un parte diario de la empresa indicada. */
export async function assertRowInCompany(rowId: string, companyId: string): Promise<void> {
  const row = await prisma.dailyreportrows.findFirst({
    where: { id: rowId, dailyreport: { company_id: companyId } },
    select: { id: true },
  });
  if (!row) {
    throw new Error('La línea del parte diario no existe o no pertenece a la empresa activa.');
  }
}

/** Devuelve, de `rowIds`, sólo las líneas que cuelgan de partes de la empresa indicada. */
export async function filterRowsInCompany(rowIds: string[], companyId: string): Promise<string[]> {
  if (rowIds.length === 0) return [];
  const rows = await prisma.dailyreportrows.findMany({
    where: { id: { in: rowIds }, dailyreport: { company_id: companyId } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export interface RowResourceRefs {
  customerId?: string | null;
  serviceId?: string | null;
  itemId?: string | null;
  sectorServiceId?: string | null;
  areasServiceId?: string | null;
  employeeIds?: string[];
  equipmentIds?: string[];
  otherEquipmentIds?: string[];
  customerEquipmentIds?: string[];
}

/**
 * Verifica que cliente, contrato, ítem, sector, área, empleados y equipos pertenezcan a la
 * empresa activa antes de asociarlos a una línea. Sin RLS es la única defensa: la FK acepta
 * cualquier uuid que llegue del cliente.
 */
export async function assertRowResourcesInCompany(companyId: string, refs: RowResourceRefs): Promise<void> {
  const employeeIds = [...new Set(refs.employeeIds ?? [])];
  const equipmentIds = [...new Set(refs.equipmentIds ?? [])];
  const otherEquipmentIds = [...new Set(refs.otherEquipmentIds ?? [])];
  const customerEquipmentIds = [...new Set(refs.customerEquipmentIds ?? [])];

  const [customer, service, item, sector, area, employees, vehicles, otherEquipment, customerEquipment] =
    await Promise.all([
      refs.customerId
        ? prisma.customers.findFirst({ where: { id: refs.customerId, company_id: companyId }, select: { id: true } })
        : Promise.resolve(null),
      refs.serviceId
        ? prisma.customer_services.findFirst({
            where: { id: refs.serviceId, customers: { company_id: companyId } },
            select: { id: true },
          })
        : Promise.resolve(null),
      refs.itemId
        ? prisma.service_items.findFirst({
            where: { id: refs.itemId, customer_services: { customers: { company_id: companyId } } },
            select: { id: true },
          })
        : Promise.resolve(null),
      refs.sectorServiceId
        ? prisma.service_sectors.findFirst({
            where: { id: refs.sectorServiceId, customer_services: { customers: { company_id: companyId } } },
            select: { id: true },
          })
        : Promise.resolve(null),
      refs.areasServiceId
        ? prisma.service_areas.findFirst({
            where: { id: refs.areasServiceId, customer_services: { customers: { company_id: companyId } } },
            select: { id: true },
          })
        : Promise.resolve(null),
      employeeIds.length
        ? prisma.employees.findMany({ where: { id: { in: employeeIds }, company_id: companyId }, select: { id: true } })
        : Promise.resolve([]),
      equipmentIds.length
        ? prisma.vehicles.findMany({ where: { id: { in: equipmentIds }, company_id: companyId }, select: { id: true } })
        : Promise.resolve([]),
      otherEquipmentIds.length
        ? prisma.other_equipment.findMany({
            where: { id: { in: otherEquipmentIds }, company_id: companyId },
            select: { id: true },
          })
        : Promise.resolve([]),
      customerEquipmentIds.length
        ? prisma.equipos_clientes.findMany({
            where: { id: { in: customerEquipmentIds }, customers: { company_id: companyId } },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

  const invalid =
    (refs.customerId && !customer) ||
    (refs.serviceId && !service) ||
    (refs.itemId && !item) ||
    (refs.sectorServiceId && !sector) ||
    (refs.areasServiceId && !area) ||
    employees.length !== employeeIds.length ||
    vehicles.length !== equipmentIds.length ||
    otherEquipment.length !== otherEquipmentIds.length ||
    customerEquipment.length !== customerEquipmentIds.length;

  if (invalid) {
    logger.warn('Recursos de otra empresa en una línea de parte diario', { data: { companyId } });
    throw new Error('Alguno de los recursos de la línea no pertenece a la empresa activa.');
  }
}
