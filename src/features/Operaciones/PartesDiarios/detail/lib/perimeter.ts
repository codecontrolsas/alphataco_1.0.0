import 'server-only';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';

const logger = new Logger('features/Operaciones/PartesDiarios/detail/lib/perimeter');

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
