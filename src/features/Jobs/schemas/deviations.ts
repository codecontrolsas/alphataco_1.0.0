/**
 * El contrato de `get_daily_report_deviations` vive en un único lugar:
 * `Operaciones/PartesDiarios/schemas/deviations.ts` (UI, job nocturno y templates lo comparten).
 * Este módulo re-exporta con los nombres que ya usan el job y los templates. `employee_id` y
 * `equipment_id` son nullable: el job tolera un `null` en vez de fallar el parse.
 */
export {
  customerEquipmentSchema,
  deviationsResultSchema,
  employeeDeviationSchema,
  equipmentDeviationSchema,
  rowWithDeviationsSchema,
} from '@/features/Operaciones/PartesDiarios/schemas/deviations';
export type {
  CustomerEquipmentInfo as CustomerEquipment,
  DailyReportDeviationsResult as DeviationsResult,
  EmployeeDeviation,
  EquipmentDeviation,
  RowWithDeviations,
} from '@/features/Operaciones/PartesDiarios/schemas/deviations';
