import type { EmployeeDeviation, EquipmentDeviation } from '../../actions/validation.server';
import type { DailyReportDetailRow } from '../types';

// ============================================================================
// PERMISSIONS TYPE
// ============================================================================

export type Permissions = {
  canUpdate: boolean;
  canDelete: boolean;
  canAssignResources: boolean;
};

// ============================================================================
// ACTION HANDLERS TYPE
// ============================================================================

export type RowActionHandlers = {
  onViewDetail: (row: DailyReportDetailRow) => void;
  onEdit: (row: DailyReportDetailRow) => void;
  onAssignResources: (row: DailyReportDetailRow) => void;
  onHistory: (row: DailyReportDetailRow) => void;
  onDelete: (row: DailyReportDetailRow) => void;
  /** Abre el gestor de remitos de la línea (mismo gestor que usa Comercial). */
  onManageRemitos: (row: DailyReportDetailRow) => void;
};

// ============================================================================
// DEVIATION GETTERS TYPE
// ============================================================================

export type DeviationGetters = {
  getEmployeeDeviation: (employeeId: string, rowId: string) => EmployeeDeviation | null;
  getEquipmentDeviation: (equipmentId: string, rowId: string) => EquipmentDeviation | null;
  /** Cantidad de desvíos (personal + equipos) de una línea; 0 si no tiene. */
  getRowDeviationCount: (rowId: string) => number;
  loadingValidations: boolean;
};
