import type { TenantTx } from '@/shared/lib/tenant-context';
import type { ResourceSet } from './types';

/**
 * Altas y bajas EXPLÍCITAS de los recursos de una línea. Nunca "borrar todo y volver a crear": cada alta es un INSERT
 * idempotente (se filtra lo ya asignado y los índices únicos de las pivotes son la red de seguridad) y cada baja es un DELETE acotado a los ids pedidos, así el historial
 * registra exactamente un LINK o un UNLINK por recurso que cambió.
 */

/**
 * Lo que `add` trae y la línea todavía no tiene. Hace falta filtrar antes de insertar: el trigger de historial de las
 * pivotes es BEFORE INSERT por fila y escribiría un LINK aunque `ON CONFLICT DO NOTHING` descartara la fila.
 */
async function onlyMissing(tx: TenantTx, rowId: string, add: ResourceSet): Promise<ResourceSet> {
  const [employees, equipment, customerEquipment] = await Promise.all([
    tx.dailyreportemployeerelations.findMany({ where: { daily_report_row_id: rowId }, select: { employee_id: true } }),
    tx.dailyreportequipmentrelations.findMany({
      where: { daily_report_row_id: rowId },
      select: { equipment_id: true, other_equipment_id: true },
    }),
    tx.dailyreport_customer_equipment_relations.findMany({
      where: { daily_report_row_id: rowId },
      select: { customer_equipment_id: true },
    }),
  ]);
  const hasEmployee = new Set(employees.map((relation) => relation.employee_id));
  const hasEquipment = new Set(equipment.map((relation) => relation.equipment_id));
  const hasOther = new Set(equipment.map((relation) => relation.other_equipment_id));
  const hasCustomerEquipment = new Set(customerEquipment.map((relation) => relation.customer_equipment_id));
  // Sin repetidos dentro del mismo pedido: el trigger de historial escribiría un LINK por cada repetido.
  const firstOf = <T>(items: T[], key: (item: T) => string) => {
    const seen = new Set<string>();
    return items.filter((item) => !seen.has(key(item)) && seen.add(key(item)));
  };
  return {
    employees: firstOf(add.employees, (employee) => employee.id).filter((employee) => !hasEmployee.has(employee.id)),
    equipment: firstOf(add.equipment, (id) => id).filter((id) => !hasEquipment.has(id)),
    otherEquipment: firstOf(add.otherEquipment, (id) => id).filter((id) => !hasOther.has(id)),
    customerEquipment: firstOf(add.customerEquipment, (id) => id).filter((id) => !hasCustomerEquipment.has(id)),
  };
}

export async function addRowResources(tx: TenantTx, rowId: string, requested: ResourceSet): Promise<number> {
  const add = await onlyMissing(tx, rowId, requested);
  let added = 0;

  if (add.employees.length > 0) {
    const result = await tx.dailyreportemployeerelations.createMany({
      data: add.employees.map((employee) => ({
        id: crypto.randomUUID(),
        daily_report_row_id: rowId,
        employee_id: employee.id,
        ...(employee.role ? { role: employee.role } : {}),
      })),
      skipDuplicates: true,
    });
    added += result.count;
  }

  const equipmentRows = [
    ...add.equipment.map((equipmentId) => ({ equipment_id: equipmentId })),
    ...add.otherEquipment.map((otherEquipmentId) => ({ other_equipment_id: otherEquipmentId })),
  ];
  if (equipmentRows.length > 0) {
    const result = await tx.dailyreportequipmentrelations.createMany({
      data: equipmentRows.map((resource) => ({ id: crypto.randomUUID(), daily_report_row_id: rowId, ...resource })),
      skipDuplicates: true,
    });
    added += result.count;
  }

  if (add.customerEquipment.length > 0) {
    const result = await tx.dailyreport_customer_equipment_relations.createMany({
      data: add.customerEquipment.map((customerEquipmentId) => ({
        id: crypto.randomUUID(),
        daily_report_row_id: rowId,
        customer_equipment_id: customerEquipmentId,
      })),
      skipDuplicates: true,
    });
    added += result.count;
  }

  return added;
}

export async function removeRowResources(tx: TenantTx, rowId: string, remove: ResourceSet): Promise<number> {
  let removed = 0;

  if (remove.employees.length > 0) {
    const result = await tx.dailyreportemployeerelations.deleteMany({
      where: { daily_report_row_id: rowId, employee_id: { in: remove.employees.map((employee) => employee.id) } },
    });
    removed += result.count;
  }

  if (remove.equipment.length > 0 || remove.otherEquipment.length > 0) {
    const result = await tx.dailyreportequipmentrelations.deleteMany({
      where: {
        daily_report_row_id: rowId,
        OR: [
          ...(remove.equipment.length > 0 ? [{ equipment_id: { in: remove.equipment } }] : []),
          ...(remove.otherEquipment.length > 0 ? [{ other_equipment_id: { in: remove.otherEquipment } }] : []),
        ],
      },
    });
    removed += result.count;
  }

  if (remove.customerEquipment.length > 0) {
    const result = await tx.dailyreport_customer_equipment_relations.deleteMany({
      where: { daily_report_row_id: rowId, customer_equipment_id: { in: remove.customerEquipment } },
    });
    removed += result.count;
  }

  return removed;
}

const sameRole = (a: string | null | undefined, b: string | null | undefined) => (a ?? null) === (b ?? null);

/**
 * Lleva los recursos de la línea al conjunto deseado aplicando SOLO la diferencia contra lo guardado (leído con la fila
 * bloqueada por el llamador): altas de lo que falta, bajas de lo que sobra y cambio de rol de los empleados que siguen.
 * Es para el formulario de edición completa, que envía el conjunto final; los clientes que envían altas y bajas usan
 * `addRowResources` / `removeRowResources` directo.
 */
export async function syncRowResources(
  tx: TenantTx,
  rowId: string,
  desired: ResourceSet
): Promise<{ added: number; removed: number }> {
  const [employees, equipment, customerEquipment] = await Promise.all([
    tx.dailyreportemployeerelations.findMany({
      where: { daily_report_row_id: rowId },
      select: { employee_id: true, role: true },
    }),
    tx.dailyreportequipmentrelations.findMany({
      where: { daily_report_row_id: rowId },
      select: { equipment_id: true, other_equipment_id: true },
    }),
    tx.dailyreport_customer_equipment_relations.findMany({
      where: { daily_report_row_id: rowId },
      select: { customer_equipment_id: true },
    }),
  ]);

  const currentEmployees = new Map(employees.map((relation) => [relation.employee_id, relation.role]));
  const wantedEmployees = new Map(desired.employees.map((employee) => [employee.id, employee.role ?? null]));
  const currentEquipment = new Set(equipment.flatMap((relation) => (relation.equipment_id ? [relation.equipment_id] : [])));
  const currentOther = new Set(equipment.flatMap((relation) => (relation.other_equipment_id ? [relation.other_equipment_id] : [])));
  const currentCustomerEquipment = new Set(customerEquipment.flatMap((relation) => (relation.customer_equipment_id ? [relation.customer_equipment_id] : [])));

  const remove: ResourceSet = {
    employees: [...currentEmployees.keys()].filter((id): id is string => id !== null && !wantedEmployees.has(id)).map((id) => ({ id })),
    equipment: [...currentEquipment].filter((id) => !desired.equipment.includes(id)),
    otherEquipment: [...currentOther].filter((id) => !desired.otherEquipment.includes(id)),
    customerEquipment: [...currentCustomerEquipment].filter((id) => !desired.customerEquipment.includes(id)),
  };
  const add: ResourceSet = {
    employees: desired.employees.filter((employee) => !currentEmployees.has(employee.id)),
    equipment: desired.equipment.filter((id) => !currentEquipment.has(id)),
    otherEquipment: desired.otherEquipment.filter((id) => !currentOther.has(id)),
    customerEquipment: desired.customerEquipment.filter((id) => !currentCustomerEquipment.has(id)),
  };

  const removed = await removeRowResources(tx, rowId, remove);
  const added = await addRowResources(tx, rowId, add);

  for (const employee of desired.employees) {
    if (currentEmployees.has(employee.id) && !sameRole(currentEmployees.get(employee.id), employee.role)) {
      await tx.dailyreportemployeerelations.updateMany({
        where: { daily_report_row_id: rowId, employee_id: employee.id },
        data: { role: employee.role ?? null },
      });
    }
  }

  return { added, removed };
}
