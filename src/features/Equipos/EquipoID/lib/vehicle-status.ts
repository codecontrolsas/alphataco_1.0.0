import { condition_enum, termination_reason_enum } from '@/generated/prisma/enums';
import { fromDateOnly } from '@/shared/lib/date-only';

/**
 * Reglas puras del estado de un vehículo: alta/baja (`is_active` + motivo + fecha) y cambios
 * de condición permitidos desde la ficha. Las server actions las aplican antes de escribir.
 */

/** Etiqueta de la UI → valor del enum `termination_reason_enum` (idempotente con el enum). */
const TERMINATION_REASON_BY_LABEL: Record<string, termination_reason_enum> = {
  venta: termination_reason_enum.venta,
  'destrucción total': termination_reason_enum.destrucci_n_total,
  devolución: termination_reason_enum.devoluci_n,
  otro: termination_reason_enum.otro,
};

export function toEquipmentTerminationReason(value: string): termination_reason_enum {
  const trimmed = value.trim();
  if ((Object.values(termination_reason_enum) as string[]).includes(trimmed)) {
    return trimmed as termination_reason_enum;
  }
  const mapped = TERMINATION_REASON_BY_LABEL[trimmed.toLowerCase()];
  if (!mapped) throw new Error(`Motivo de baja inválido: "${value}"`);
  return mapped;
}

/** Valor con espacios (legacy de la UI / PostgREST) o del enum → `condition_enum`. */
export function toConditionEnum(value: string): condition_enum {
  const normalized = value.trim().replace(/\s+/g, '_');
  if ((Object.values(condition_enum) as string[]).includes(normalized)) {
    return normalized as condition_enum;
  }
  throw new Error(`Condición inválida: "${value}"`);
}

export type EquipmentStatusChange =
  | { activate: true }
  | { activate: false; reason: string | undefined; terminationDate: Date | string | undefined };

export interface EquipmentStatusUpdate {
  is_active: boolean;
  reason_for_termination: termination_reason_enum | null;
  termination_date: Date | null;
}

/**
 * Alta/baja común a vehículos y equipamientos: el reintegro limpia motivo y fecha; la baja
 * exige motivo (mapeado al enum) y fecha (guardada como día, columna DATE).
 */
export function buildEquipmentStatusUpdate(change: EquipmentStatusChange): EquipmentStatusUpdate {
  if (change.activate) {
    return { is_active: true, reason_for_termination: null, termination_date: null };
  }
  const reason = toEquipmentTerminationReason(change.reason ?? '');
  const terminationDate = fromDateOnly(change.terminationDate);
  if (!terminationDate) throw new Error('La fecha de baja es requerida');
  return { is_active: false, reason_for_termination: reason, termination_date: terminationDate };
}

export type VehicleStatusChange = EquipmentStatusChange & { condition: string };

export interface VehicleStatusUpdate extends EquipmentStatusUpdate {
  condition: condition_enum;
}

/** Igual que `buildEquipmentStatusUpdate` pero además fija la condición (normalizada al enum). */
export function buildVehicleStatusUpdate(change: VehicleStatusChange): VehicleStatusUpdate {
  const condition = toConditionEnum(change.condition);
  return { ...buildEquipmentStatusUpdate(change), condition };
}

/** Transiciones de condición que la ficha (header) puede disparar; el resto las maneja Mantenimiento. */
export const HEADER_CONDITION_TRANSITIONS: ReadonlyArray<{ from: condition_enum; to: condition_enum }> = [
  { from: condition_enum.en_preparacion, to: condition_enum.operativo },
];

export function canChangeConditionFromHeader(from: condition_enum | null | undefined, to: condition_enum): boolean {
  if (!from) return false;
  return HEADER_CONDITION_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/** Condiciones de origen desde las que la ficha puede pasar un equipo a `to` (vacío si no hay transición permitida). */
export function allowedSourceConditions(to: condition_enum): condition_enum[] {
  return HEADER_CONDITION_TRANSITIONS.filter((t) => t.to === to).map((t) => t.from);
}

/** Condiciones que la UI ofrece al reactivar (`en_reparacion` la fija el circuito del taller). */
export const REACTIVATION_TARGET_CONDITIONS: readonly condition_enum[] = [
  condition_enum.operativo,
  condition_enum.operativo_condicionado,
  condition_enum.en_preparacion,
];
