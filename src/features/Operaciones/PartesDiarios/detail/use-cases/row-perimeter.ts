import type { Prisma } from '@/generated/prisma/client';
import { RowRuleError } from './errors';

/** Cualquier cliente con los modelos que se consultan: una transacción del caso de uso o el `prisma` de la web. */
export type PerimeterDb = Pick<
  Prisma.TransactionClient,
  | 'customers'
  | 'customer_services'
  | 'service_items'
  | 'service_sectors'
  | 'service_areas'
  | 'employees'
  | 'vehicles'
  | 'other_equipment'
  | 'equipos_clientes'
  | 'preparte'
>;

export interface RowResourceRefs {
  /** Preparte vinculado a la línea: sin esto se podía vincular (y después revertir) un preparte de otra empresa. */
  preparteId?: string | null;
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
 * Verifica que cliente, contrato, ítem, sector, área, empleados y equipos pertenezcan a la empresa antes de asociarlos
 * a una línea (la FK acepta cualquier uuid que llegue del cliente). Con `requireActive` (solo en las ALTAS) también
 * exige que empleados y equipos estén activos: un recurso dado de baja que ya estaba asignado no bloquea la línea.
 */
export async function assertResourcesInCompany(
  db: PerimeterDb,
  companyId: string,
  refs: RowResourceRefs,
  options: { requireActive?: boolean } = {}
): Promise<void> {
  const employeeIds = [...new Set(refs.employeeIds ?? [])];
  const equipmentIds = [...new Set(refs.equipmentIds ?? [])];
  const otherEquipmentIds = [...new Set(refs.otherEquipmentIds ?? [])];
  const customerEquipmentIds = [...new Set(refs.customerEquipmentIds ?? [])];

  const [customer, service, item, sector, area, employees, vehicles, otherEquipment, customerEquipment, preparte] =
    await Promise.all([
      refs.customerId
        ? db.customers.findFirst({ where: { id: refs.customerId, company_id: companyId }, select: { id: true } })
        : Promise.resolve(null),
      refs.serviceId
        ? db.customer_services.findFirst({
            where: { id: refs.serviceId, customers: { company_id: companyId } },
            select: { id: true },
          })
        : Promise.resolve(null),
      refs.itemId
        ? db.service_items.findFirst({
            where: { id: refs.itemId, customer_services: { customers: { company_id: companyId } } },
            select: { id: true },
          })
        : Promise.resolve(null),
      refs.sectorServiceId
        ? db.service_sectors.findFirst({
            where: { id: refs.sectorServiceId, customer_services: { customers: { company_id: companyId } } },
            select: { id: true },
          })
        : Promise.resolve(null),
      refs.areasServiceId
        ? db.service_areas.findFirst({
            where: { id: refs.areasServiceId, customer_services: { customers: { company_id: companyId } } },
            select: { id: true },
          })
        : Promise.resolve(null),
      employeeIds.length
        ? db.employees.findMany({ where: { id: { in: employeeIds }, company_id: companyId }, select: { id: true, is_active: true } })
        : Promise.resolve([]),
      equipmentIds.length
        ? db.vehicles.findMany({ where: { id: { in: equipmentIds }, company_id: companyId }, select: { id: true, is_active: true } })
        : Promise.resolve([]),
      otherEquipmentIds.length
        ? db.other_equipment.findMany({
            where: { id: { in: otherEquipmentIds }, company_id: companyId },
            select: { id: true, is_active: true },
          })
        : Promise.resolve([]),
      customerEquipmentIds.length
        ? db.equipos_clientes.findMany({
            where: { id: { in: customerEquipmentIds }, customers: { company_id: companyId } },
            select: { id: true },
          })
        : Promise.resolve([]),
      refs.preparteId
        ? db.preparte.findFirst({ where: { id: refs.preparteId, company_id: companyId }, select: { id: true } })
        : Promise.resolve(null),
    ]);

  const missing =
    (refs.customerId && !customer) ||
    (refs.serviceId && !service) ||
    (refs.itemId && !item) ||
    (refs.sectorServiceId && !sector) ||
    (refs.areasServiceId && !area) ||
    (refs.preparteId && !preparte) ||
    employees.length !== employeeIds.length ||
    vehicles.length !== equipmentIds.length ||
    otherEquipment.length !== otherEquipmentIds.length ||
    customerEquipment.length !== customerEquipmentIds.length;
  if (missing) {
    throw new RowRuleError('Alguno de los recursos de la línea no pertenece a la empresa activa.', 'NOT_FOUND');
  }

  if (options.requireActive) {
    const inactive = [...employees, ...vehicles, ...otherEquipment].some((resource) => resource.is_active === false);
    if (inactive) throw new RowRuleError('No se pueden asignar recursos dados de baja.', 'RESOURCE_INACTIVE');
  }
}
