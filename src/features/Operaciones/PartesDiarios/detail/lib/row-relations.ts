import 'server-only';

import type { PrismaTransactionClient } from './row-query';

/**
 * Escritura de las relaciones de una línea del parte (empleados, equipos y equipos de clientes).
 *
 * Vive acá y no en `mutations.server.ts` porque ese archivo es `'use server'`: todo lo que exporta se publica
 * como Server Action invocable desde el navegador, y esta función recibe una transacción de Prisma.
 */

/** Un empleado con rol opcional (para jornadas 12/24 hrs) */
export interface EmployeeInput {
  id: string;
  role?: 'chofer_dia' | 'chofer_noche' | 'ayudante_dia' | 'ayudante_noche';
}

/**
 * Crea todas las relaciones (empleados, equipos, equipos de clientes)
 * de una fila dentro de una transacción existente.
 */
export async function createRowRelations(
  tx: PrismaTransactionClient,
  rowId: string,
  employees: EmployeeInput[],
  equipment: string[],
  otherEquipment: string[],
  customerEquipment: string[]
): Promise<void> {
  // Empleados
  if (employees.length > 0) {
    await tx.dailyreportemployeerelations.createMany({
      data: employees.map((emp) => ({
        id: crypto.randomUUID(),
        daily_report_row_id: rowId,
        employee_id: emp.id,
        ...(emp.role ? { role: emp.role } : {}),
      })),
    });
  }

  // Vehículos + otros equipos (misma tabla, columnas distintas)
  const equipmentData: Array<{
    id: string;
    daily_report_row_id: string;
    equipment_id?: string;
    other_equipment_id?: string;
  }> = [
    ...equipment.map((eid) => ({
      id: crypto.randomUUID(),
      daily_report_row_id: rowId,
      equipment_id: eid,
    })),
    ...otherEquipment.map((oeid) => ({
      id: crypto.randomUUID(),
      daily_report_row_id: rowId,
      other_equipment_id: oeid,
    })),
  ];

  if (equipmentData.length > 0) {
    await tx.dailyreportequipmentrelations.createMany({ data: equipmentData });
  }

  // Equipos de clientes
  if (customerEquipment.length > 0) {
    await tx.dailyreport_customer_equipment_relations.createMany({
      data: customerEquipment.map((ceid) => ({
        id: crypto.randomUUID(),
        daily_report_row_id: rowId,
        customer_equipment_id: ceid,
      })),
    });
  }
}
