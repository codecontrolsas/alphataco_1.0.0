import { useMemo } from 'react';
import type { EmployeeForForm } from '../../../form-data.server';

/** `true` si el empleado está afectado al cliente indicado. */
export function isAssignedToCustomer(employee: EmployeeForForm, customerId: string | null) {
  return Boolean(employee.contractor_employee?.some((ce) => ce.customers?.id === customerId));
}

export interface EmployeePositionGroup {
  position: string;
  /** Nombre del puesto con la primera letra en mayúscula, para el encabezado del grupo. */
  heading: string;
  employees: EmployeeForForm[];
}

/** Empleados agrupados por puesto y ordenados alfabéticamente, para las listas de selección. */
export function useEmployeePositionGroups(employees: EmployeeForForm[]): EmployeePositionGroup[] {
  return useMemo(() => {
    const byPosition: Record<string, EmployeeForForm[]> = {};
    for (const employee of employees) {
      const position = employee.company_positions?.name ?? 'Sin posición';
      (byPosition[position] ??= []).push(employee);
    }
    return Object.keys(byPosition)
      .sort()
      .map((position) => ({
        position,
        heading: position.charAt(0).toUpperCase() + position.slice(1),
        employees: byPosition[position],
      }));
  }, [employees]);
}
