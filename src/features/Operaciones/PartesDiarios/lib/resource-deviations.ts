/**
 * Clasificación de desvíos de recursos asignados a una línea de parte diario.
 *
 * Módulo puro (sin BD, sin `server-only`): la misma regla la aplica la UI del detalle
 * (`detail/columns/badge-cells.tsx`, que consume estas funciones) y la función SQL
 * `get_daily_report_deviations` (`prisma/sql/daily-report.sql`). Tenerla acá permite
 * testearla y evita que la regla se escriba distinto en cada pantalla.
 *
 * Semántica ADITIVA — igual que el SQL, que arma cada fila con
 * `WHERE is_duplicated OR is_unassigned_to_client OR has_no_diagram OR is_non_work_day`
 * (empleados) / `WHERE is_duplicated OR is_unassigned_to_client OR (condition <> 'operativo')`
 * (equipos): un recurso puede tener VARIOS desvíos simultáneos a la vez (ej. duplicado Y sin
 * diagrama cargado), no uno solo elegido por prioridad.
 */

import { normalizeEquipmentCondition, type EquipmentConditionKey } from './equipment-condition';

export interface EmployeeDeviationFlags {
  is_duplicated: boolean;
  is_unassigned_to_client: boolean;
  has_no_diagram: boolean;
  is_non_work_day: boolean;
  /** Nombre del tipo de diagrama del día. Sólo se usa en el label de `non_work_day`. */
  diagram_type_name?: string | null;
}

export interface EquipmentDeviationFlags {
  is_duplicated: boolean;
  is_unassigned_to_client: boolean;
  /** `vehicles.condition` / `other_equipment.condition` (la función SQL la COALESCEa a `'desconocido'`). */
  condition: string | null;
}

export type EmployeeDeviationKind = Extract<
  DeviationKind,
  'duplicated' | 'unassigned_to_client' | 'no_diagram' | 'non_work_day'
>;

export type EquipmentDeviationKind =
  | 'duplicated'
  | 'not_operative'
  | 'under_repair'
  | 'unassigned_to_client'
  | 'conditioned'
  | 'in_preparation';

/**
 * Vocabulario ÚNICO de los desvíos: rótulos cortos que comparten la pantalla del parte (badges y
 * tooltips) y el correo de desvíos (`Jobs/templates/deviations.ts`). Módulo puro: el correo lo
 * importa sin arrastrar nada de `server-only`.
 */
export const DEVIATION_LABELS = {
  duplicated: 'Duplicado',
  unassigned_to_client: 'No afectado',
  no_diagram: 'Sin diagrama',
  non_work_day: 'Día no laboral',
  not_operative: 'No operativo',
  under_repair: 'En reparación',
  conditioned: 'Condicionado',
  in_preparation: 'En preparación',
} as const;

export type DeviationKind = keyof typeof DEVIATION_LABELS;

/** Condición de equipo que dispara cada desvío de condición (el resto no es desvío). */
export const CONDITION_DEVIATION_KIND = {
  'no operativo': 'not_operative',
  'en reparacion': 'under_repair',
  'operativo condicionado': 'conditioned',
  'en preparacion': 'in_preparation',
} as const satisfies Partial<Record<EquipmentConditionKey, DeviationKind>>;

export interface DeviationEntry<K extends DeviationKind> {
  kind: K;
  /** Rótulo corto del vocabulario común (`DEVIATION_LABELS`). */
  label: string;
  /** Explicación larga: solo para el tooltip o el aviso de la pantalla, nunca para el correo. */
  detail: string;
}

/** Texto de tooltip / aviso: rótulo corto y, tras la raya, el detalle largo. */
export function deviationText(entry: DeviationEntry<DeviationKind>): string {
  return `${entry.label} — ${entry.detail}`;
}

/**
 * Desvíos de DIAGRAMA de un empleado a partir de sus entradas de diagrama del día
 * (`employees_diagram`) y el `work_active` del tipo de diagrama. Misma regla que el SQL:
 * sin entrada = sin diagrama; con entrada y `work_active === false` = día no laboral.
 */
export function classifyEmployeeDiagram(
  diagramEntriesCount: number,
  workActive: boolean | null | undefined
): { has_no_diagram: boolean; is_non_work_day: boolean } {
  const hasNoDiagram = diagramEntriesCount === 0;
  return { has_no_diagram: hasNoDiagram, is_non_work_day: !hasNoDiagram && workActive === false };
}

/**
 * Todos los desvíos que aplican a un empleado (0, 1 o varios, simultáneos). El orden
 * coincide con el que arma hoy el tooltip de `EmployeeBadgeCell`.
 */
export function employeeDeviations(flags: EmployeeDeviationFlags): DeviationEntry<EmployeeDeviationKind>[] {
  const entries: DeviationEntry<EmployeeDeviationKind>[] = [];
  if (flags.is_duplicated) {
    entries.push({
      kind: 'duplicated',
      label: DEVIATION_LABELS.duplicated,
      detail: 'Empleado asignado en múltiples filas',
    });
  }
  if (flags.is_unassigned_to_client) {
    entries.push({
      kind: 'unassigned_to_client',
      label: DEVIATION_LABELS.unassigned_to_client,
      detail: 'No asignado al cliente de esta fila',
    });
  }
  if (flags.has_no_diagram) {
    entries.push({
      kind: 'no_diagram',
      label: DEVIATION_LABELS.no_diagram,
      detail: 'Sin diagrama cargado para este día',
    });
  }
  if (flags.is_non_work_day) {
    entries.push({
      kind: 'non_work_day',
      label: DEVIATION_LABELS.non_work_day,
      detail: `Diagrama del día: ${flags.diagram_type_name ?? 'No laboral'}`,
    });
  }
  return entries;
}

/**
 * Todos los desvíos que aplican a un equipo (0, 1 o varios, simultáneos). El orden coincide
 * con el que arma hoy el tooltip de `EquipmentBadgeCell`.
 */
export function equipmentDeviations(flags: EquipmentDeviationFlags): DeviationEntry<EquipmentDeviationKind>[] {
  const condition = normalizeEquipmentCondition(flags.condition);
  const entries: DeviationEntry<EquipmentDeviationKind>[] = [];

  if (flags.is_duplicated) {
    entries.push({
      kind: 'duplicated',
      label: DEVIATION_LABELS.duplicated,
      detail: 'Asignado en múltiples filas del parte diario',
    });
  }
  if (condition === 'no operativo') {
    entries.push({ kind: 'not_operative', label: DEVIATION_LABELS.not_operative, detail: 'Condición del equipo' });
  }
  if (condition === 'en reparacion') {
    entries.push({ kind: 'under_repair', label: DEVIATION_LABELS.under_repair, detail: 'Condición del equipo' });
  }
  if (flags.is_unassigned_to_client) {
    entries.push({
      kind: 'unassigned_to_client',
      label: DEVIATION_LABELS.unassigned_to_client,
      detail: 'No asignado al cliente de esta fila',
    });
  }
  if (condition === 'operativo condicionado') {
    entries.push({ kind: 'conditioned', label: DEVIATION_LABELS.conditioned, detail: 'Condición del equipo' });
  }
  if (condition === 'en preparacion') {
    entries.push({ kind: 'in_preparation', label: DEVIATION_LABELS.in_preparation, detail: 'Condición del equipo' });
  }
  return entries;
}
