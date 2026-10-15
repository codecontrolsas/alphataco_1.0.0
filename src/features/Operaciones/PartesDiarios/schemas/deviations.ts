import { z } from 'zod';

/**
 * Contrato ÚNICO del resultado de `get_daily_report_deviations(p_daily_report_id uuid, p_report_date date)`
 * (`prisma/sql/daily-report.sql`), que devuelve un solo `jsonb`.
 *
 * Lo usan la UI del detalle del parte, el job nocturno de mail y los templates. Módulo SIN
 * directiva (`'use server'` / `'use client'`): un archivo `'use server'` no puede exportar la
 * constante zod, y uno `'use client'` llegaría al servidor como referencia de cliente.
 *
 * Los ids son nullable a propósito: el SQL no los COALESCEa y un solo `null` con un schema
 * estricto rompía todo el panel (y haría fallar el parse del job de mail).
 */
export const employeeDeviationSchema = z.object({
  /** `dailyreportemployeerelations.employee_id` es nullable en el schema; el SQL no lo COALESCEa. */
  employee_id: z.string().nullable(),
  employee_name: z.string(),
  employee_cuil: z.string(),
  role: z.string(),
  is_duplicated: z.boolean(),
  is_unassigned_to_client: z.boolean(),
  has_no_diagram: z.boolean(),
  is_non_work_day: z.boolean(),
  diagram_type_name: z.string().nullable(),
});

export const equipmentDeviationSchema = z.object({
  /**
   * Id efectivo de la relación polimórfica: `vehicles.id` u `other_equipment.id`
   * (`COALESCE(equipment_id, other_equipment_id)`). Null si ambas columnas están vacías (dato corrupto).
   */
  equipment_id: z.string().nullable(),
  equipment_domain: z.string(),
  equipment_intern_number: z.string(),
  /** Identificador a mostrar: dominio del vehículo, o N° de serie / interno si es otro equipo. */
  equipment_label: z.string(),
  /** Tipo del otro equipo (Pileta, Contenedor). `null` en vehículos. */
  equipment_type: z.string().nullable(),
  /** `true` cuando la relación apunta a `other_equipment` en vez de a `vehicles`. */
  is_other_equipment: z.boolean(),
  condition: z.string(),
  is_duplicated: z.boolean(),
  is_unassigned_to_client: z.boolean(),
});

export const customerEquipmentSchema = z.object({
  name: z.string(),
  type: z.string(),
});

export const rowWithDeviationsSchema = z.object({
  row_id: z.string(),
  /** `dailyreportrows.customer_id` es nullable; el SQL no lo COALESCEa (a diferencia de `customer_name`). */
  customer_id: z.string().nullable(),
  customer_name: z.string(),
  service_name: z.string(),
  item_name: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  working_day: z.string().nullable(),
  type_service: z.string().nullable(),
  status: z.string().nullable(),
  description: z.string().nullable(),
  sector_name: z.string().nullable(),
  area_name: z.string().nullable(),
  customer_equipment: z.array(customerEquipmentSchema),
  employee_deviations: z.array(employeeDeviationSchema),
  equipment_deviations: z.array(equipmentDeviationSchema),
});

export const deviationsSummarySchema = z.object({
  // `coerce`: tolera que el jsonb entregue los conteos como string/bigint serializado.
  total_employee_deviations: z.coerce.number(),
  total_equipment_deviations: z.coerce.number(),
  total_duplicated_employees: z.coerce.number(),
  total_duplicated_equipment: z.coerce.number(),
  total_rows_with_deviations: z.coerce.number(),
});

export const deviationsResultSchema = z.object({
  rows_with_deviations: z.array(rowWithDeviationsSchema),
  summary: deviationsSummarySchema,
});

/**
 * Variante liviana (`p_include_context = false`): solo lo que consume la UI del detalle (`row_id` y los
 * desvíos de cada línea, más el resumen). La completa (con nombres de catálogos y equipos del cliente) es
 * para el mail nocturno.
 */
export const rowDeviationsLiteSchema = rowWithDeviationsSchema.pick({
  row_id: true,
  employee_deviations: true,
  equipment_deviations: true,
});

export const deviationsLiteResultSchema = z.object({
  rows_with_deviations: z.array(rowDeviationsLiteSchema),
  summary: deviationsSummarySchema,
});

export type EmployeeDeviation = z.infer<typeof employeeDeviationSchema>;
export type EquipmentDeviation = z.infer<typeof equipmentDeviationSchema>;
export type CustomerEquipmentInfo = z.infer<typeof customerEquipmentSchema>;
export type RowWithDeviations = z.infer<typeof rowWithDeviationsSchema>;
export type DeviationsSummary = z.infer<typeof deviationsSummarySchema>;
export type DailyReportDeviationsResult = z.infer<typeof deviationsResultSchema>;
export type DailyReportDeviationsLite = z.infer<typeof deviationsLiteResultSchema>;

export const EMPTY_DEVIATIONS_SUMMARY: DeviationsSummary = {
  total_employee_deviations: 0,
  total_equipment_deviations: 0,
  total_duplicated_employees: 0,
  total_duplicated_equipment: 0,
  total_rows_with_deviations: 0,
};
