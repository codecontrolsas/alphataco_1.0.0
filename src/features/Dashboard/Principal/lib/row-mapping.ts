import type { EmployeeNotInReportResult, VehicleNotInReportResult } from '../actions/types';

/**
 * Mapeo de filas de Prisma a los DTOs del dashboard principal, y el armado de los mapas de
 * facetas. Lógica pura: la misma transformación la usaban cuatro funciones distintas con
 * el código copiado.
 */

/** Relación M:N empleado/equipo ↔ cliente, tal como la devuelve el `select`. */
interface ContractorRelation {
  customers: { name: string | null } | null;
}

/** Nombres de clientes de una relación M:N, o `null` si no hay ninguno. */
export function mapCustomers(
  relations: readonly ContractorRelation[] | null | undefined
): { customer_name: string }[] | null {
  const customers = (relations ?? [])
    .map((relation) => relation.customers?.name)
    .filter((name): name is string => name != null)
    .map((name) => ({ customer_name: name }));

  return customers.length > 0 ? customers : null;
}

export interface VehicleRow {
  id: string;
  domain: string | null;
  type_vehicles_typeTotype: { name: string | null } | null;
  sub_type: { name: string | null } | null;
  contractor_equipment: ContractorRelation[];
}

/** Fila de `vehicles` → item del diálogo de equipos fuera del parte / en reparación. */
export function mapVehicleToResult(vehicle: VehicleRow): VehicleNotInReportResult {
  return {
    vehicle_id: vehicle.id,
    domain: vehicle.domain ?? '',
    type_name: vehicle.type_vehicles_typeTotype?.name ?? null,
    sub_type_name: vehicle.sub_type?.name ?? null,
    customers: mapCustomers(vehicle.contractor_equipment),
  };
}

export interface EmployeeDiagramRow {
  employees: {
    id: string;
    firstname: string | null;
    lastname: string | null;
    cuil: string | null;
    file: string | null;
    company_positions: { name: string | null } | null;
    contractor_employee: ContractorRelation[];
  } | null;
  diagram_type_employees_diagram_diagram_typeTodiagram_type: {
    short_description: string | null;
    color: string | null;
  } | null;
}

/**
 * Filas de `employees_diagram` → empleados fuera del parte, sin repetidos.
 * Un empleado puede tener varias filas de diagrama en el día: se queda la primera.
 */
export function mapEmployeesNotInReport(rows: readonly EmployeeDiagramRow[]): EmployeeNotInReportResult[] {
  const seen = new Set<string>();
  const result: EmployeeNotInReportResult[] = [];

  for (const row of rows) {
    const employee = row.employees;
    if (!employee || seen.has(employee.id)) continue;
    seen.add(employee.id);

    const diagramType = row.diagram_type_employees_diagram_diagram_typeTodiagram_type;

    result.push({
      employee_id: employee.id,
      firstname: employee.firstname ?? '',
      lastname: employee.lastname ?? '',
      cuil: employee.cuil,
      file_number: employee.file ?? null,
      position_name: employee.company_positions?.name ?? null,
      diagram_short_description: diagramType?.short_description ?? null,
      diagram_color: diagramType?.color ?? null,
      customers: mapCustomers(employee.contractor_employee),
    });
  }

  return result;
}
