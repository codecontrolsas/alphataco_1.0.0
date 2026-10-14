/**
 * Mapa ÚNICO de la condición de un equipo (`vehicles.condition` / `other_equipment.condition`).
 *
 * Valores reales del enum `condition_enum` en la base (lo que devuelve el SQL y lo que guarda
 * Postgres, con espacios): `operativo`, `no operativo`, `en reparacion`, `operativo condicionado`,
 * `en preparacion`. El cliente de Prisma, en cambio, expone las claves con guion bajo
 * (`no_operativo`, `en_reparacion`, ...). `normalizeEquipmentCondition` unifica ambas formas
 * (y mayúsculas) a la clave normalizada con espacios; `desconocido` cubre cualquier otro valor
 * (la función SQL COALESCEa a `'desconocido'`).
 */
export const EQUIPMENT_CONDITION_LABELS = {
  operativo: 'Operativo',
  'no operativo': 'No operativo',
  'en reparacion': 'En reparación',
  'operativo condicionado': 'Operativo condicionado',
  'en preparacion': 'En preparación',
  desconocido: 'Desconocido',
} as const;

export type EquipmentConditionKey = keyof typeof EQUIPMENT_CONDITION_LABELS;

/** Clave normalizada de una condición cruda (con espacios o guion bajo, cualquier caja). */
export function normalizeEquipmentCondition(condition: string | null | undefined): EquipmentConditionKey {
  const key = (condition ?? '').trim().toLowerCase().replace(/_/g, ' ');
  return key in EQUIPMENT_CONDITION_LABELS ? (key as EquipmentConditionKey) : 'desconocido';
}

export function equipmentConditionLabel(condition: string | null | undefined): string {
  return EQUIPMENT_CONDITION_LABELS[normalizeEquipmentCondition(condition)];
}
