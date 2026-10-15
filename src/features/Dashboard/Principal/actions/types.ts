/**
 * Tipos de resultado del dashboard principal.
 *
 * Viven fuera de los módulos `'use server'` porque los consumen tanto las actions como los
 * componentes cliente, y un archivo `'use server'` sólo debería exportar actions.
 */

export interface ServicesSummaryResult {
  type_service: string;
  service_count: number;
  percentage: number;
}

export interface EmployeeIndicatorResult {
  employees_operativos: number;
  employees_used: number;
  /** Con diagrama de trabajo hoy y fuera del parte (nunca negativo). */
  employees_available: number;
  /** En el parte de hoy solo en servicios cancelados: no cuentan en operación, se informan aparte. */
  employees_cancelled: number;
  /** Porcentaje de uso; `null` cuando no hay empleados con diagrama de trabajo (no es 0 %). */
  indicator: number | null;
}

export interface DiagramIndicatorResult {
  diagram_type_id: string;
  diagram_type_name: string;
  diagram_type_color: string;
  cantidad_empleados: number;
}

export interface EmployeeNotInReportResult {
  employee_id: string;
  firstname: string;
  lastname: string;
  cuil: string | null;
  file_number: string | null;
  position_name: string | null;
  diagram_short_description: string | null;
  diagram_color: string | null;
  customers: { customer_name: string }[] | null;
}

export interface EquipmentIndicatorResult {
  type_name: string;
  type_color: string | null;
  available_units: number;
  used_units: number;
  not_available_units: number;
  /** Operativos que hoy están solo en servicios cancelados (no cuentan en `used_units`). */
  cancelled_units: number;
}

export interface VehicleNotInReportResult {
  vehicle_id: string;
  domain: string;
  type_name: string | null;
  sub_type_name: string | null;
  customers: { customer_name: string }[] | null;
}

export interface ServiceDetailByClient {
  client_name: string;
  mensual_count: number;
  adicional_count: number;
  total_count: number;
  status_distribution: {
    status: string;
    count: number;
  }[];
}
