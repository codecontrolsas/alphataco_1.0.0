import type { DailyReportRowInput } from '../mutations.server';

/**
 * Helpers de escritura de líneas compartidos por create/update (`mutations.server.ts`).
 * Sin `'use server'`: son funciones puras y síncronas.
 */

/**
 * `HH:mm[:ss]` → `Date` de la columna `Time`. Se arma en UTC (`Z`): Prisma lee y escribe `Time` como 1970-01-01 en UTC,
 * así que sin la `Z` la hora se corría según la zona del proceso.
 */
export function parseRowTime(value: string | null | undefined): Date | null {
  return value ? new Date(`1970-01-01T${value}Z`) : null;
}

/** Recursos de la entrada, con default `[]`, y si la línea tiene alguno (empleados o equipos). */
export function resolveRowResources(data: DailyReportRowInput) {
  const employees = data.employees ?? [];
  const equipment = data.equipment ?? [];
  const otherEquipment = data.other_equipment ?? [];
  const customerEquipment = data.customer_equipment ?? [];
  const hasResources = employees.length > 0 || equipment.length > 0 || otherEquipment.length > 0;
  return { employees, equipment, otherEquipment, customerEquipment, hasResources };
}

/** Argumento de `assertRowResourcesInCompany` a partir de la entrada de la línea. */
export function buildResourceCheck(
  data: DailyReportRowInput,
  resources: Pick<ReturnType<typeof resolveRowResources>, 'employees' | 'equipment' | 'otherEquipment' | 'customerEquipment'>
) {
  return {
    customerId: data.customer_id,
    serviceId: data.service_id,
    itemId: data.item_id,
    sectorServiceId: data.sector_service_id,
    areasServiceId: data.areas_service_id,
    employeeIds: resources.employees.map((employee) => employee.id),
    equipmentIds: resources.equipment,
    otherEquipmentIds: resources.otherEquipment,
    customerEquipmentIds: resources.customerEquipment,
  };
}

/** Columnas escalares idénticas en create y update. */
export function buildRowScalarData(data: DailyReportRowInput) {
  return {
    customer_id: data.customer_id,
    service_id: data.service_id,
    item_id: data.item_id,
    working_day: data.working_day,
    shift_12h: data.shift_12h ?? null,
    start_time: parseRowTime(data.start_time),
    end_time: parseRowTime(data.end_time),
    description: data.description ?? null,
    sector_service_id: data.sector_service_id ?? null,
    areas_service_id: data.areas_service_id ?? null,
    cancel_reason: data.cancel_reason ?? null,
    completed_day: data.completed_day ?? null,
    completed_night: data.completed_night ?? null,
    preparte_id: data.preparte_id ?? null,
  };
}
