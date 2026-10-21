/**
 * Recurso de mantenimiento: vehículo o equipamiento (ticket 596).
 *
 * Una solicitud/pedido apunta a UN vehículo (`vehicles`) o a UN equipamiento
 * (`other_equipment`), nunca a los dos — la BD lo garantiza con un CHECK.
 *
 * Este módulo concentra las dos operaciones que ese polimorfismo obliga a repetir
 * en todo el módulo: filtrar por empresa sin importar de qué tipo sea el recurso,
 * y resolver cómo se muestra. Sin esto habría que duplicar la lógica en los 16
 * `where` y en los ~55 `select` que hoy asumen que siempre hay un vehículo.
 */

/** Los dos caminos del formulario de Nuevo Pedido */
export type MaintenanceResourceKind = 'vehicle' | 'other_equipment';

/**
 * Condición de empresa que abarca los dos tipos de recurso.
 *
 * Reemplaza a `{ vehicles: { company_id: companyId } }`, que dejaba fuera a los
 * equipamientos.
 *
 * IMPORTANTE: devuelve un `OR`, así que **va siempre dentro de un `AND`**, nunca
 * spreadeada al nivel raíz del `where`. Los helpers de búsqueda del DataTable
 * (`buildSearchWhere`) también producen un `OR` a ese nivel: spreadear las dos
 * hace que una pise a la otra en silencio y se pierda el filtro de empresa.
 *
 * @example
 * where: { AND: [resourceCompanyCondition(companyId), ...otras], status: {...} }
 */
export function resourceCompanyCondition(companyId: string) {
  return {
    OR: [{ vehicles: { company_id: companyId } }, { other_equipment: { company_id: companyId } }],
  };
}

/**
 * Condición que deja afuera los equipamientos de los tipos que el usuario no ve
 * (ticket 690). Los vehículos pasan siempre. Los ids salen de
 * `getHiddenEquipmentTypeIds()` (utils/equipmentTypeVisibility.ts).
 *
 * Devuelve `null` cuando no hay tipos ocultos, para no agregar nada al `where`.
 * Mismo cuidado que `resourceCompanyCondition`: es un `OR`, **va dentro de un `AND`**.
 * Aplica a cualquier modelo con `other_equipment_id` + relación `other_equipment`
 * (maintenance_requests, maintenance_orders, work_orders); para modelos hijos se anida
 * bajo la relación (ej. `{ maintenance_orders: condition }`).
 *
 * @example
 * const equipmentCondition = visibleEquipmentTypeCondition(hiddenTypeIds);
 * where: { AND: [resourceCompanyCondition(companyId), ...(equipmentCondition ? [equipmentCondition] : [])] }
 */
export function visibleEquipmentTypeCondition(hiddenTypeIds: readonly string[]) {
  if (hiddenTypeIds.length === 0) return null;
  return {
    OR: [{ other_equipment_id: null }, { other_equipment: { type_id: { notIn: [...hiddenTypeIds] } } }],
  };
}

/** Forma mínima que necesitan los helpers de presentación */
type VehicleShape = {
  domain?: string | null;
  serie?: string | null;
  intern_number?: string | null;
  condition?: string | null;
} | null;

type OtherEquipmentShape = {
  serial_number?: string | null;
  intern_number?: string | null;
  condition?: string | null;
} | null;

export type WithMaintenanceResource = {
  vehicles?: VehicleShape;
  other_equipment?: OtherEquipmentShape;
};

/** De qué tipo es el recurso de esta fila */
export function getResourceKind(row: WithMaintenanceResource): MaintenanceResourceKind {
  return row.other_equipment ? 'other_equipment' : 'vehicle';
}

/**
 * Identificador visible del recurso.
 *
 * Un vehículo se reconoce por su dominio (patente); un equipamiento no tiene
 * dominio, así que se identifica por número de serie. En ambos casos el número
 * interno es el último recurso, porque es lo que el operario tiene a mano.
 */
export function getResourceLabel(row: WithMaintenanceResource): string {
  if (row.other_equipment) {
    const { serial_number, intern_number } = row.other_equipment;
    return serial_number || intern_number || 'Sin identificar';
  }
  const v = row.vehicles;
  return v?.domain || v?.serie || v?.intern_number || 'Sin identificar';
}

/** Número interno, que se muestra como dato secundario junto al identificador */
export function getResourceInternNumber(row: WithMaintenanceResource): string | null {
  return (row.other_equipment ? row.other_equipment.intern_number : row.vehicles?.intern_number) ?? null;
}

/**
 * Etiqueta del tipo de recurso, para distinguirlos en listados donde conviven.
 * En una tabla mezclada, "AB093KH" y "CT-4471" no se distinguen solos.
 */
export function getResourceKindLabel(row: WithMaintenanceResource): string {
  return row.other_equipment ? 'Equipamiento' : 'Equipo';
}

/**
 * Columnas de recurso listas para un `create` de Prisma.
 *
 * Devuelve SIEMPRE las dos, una con valor y la otra en null, para no depender de
 * spreads condicionales en cada llamador y para que el CHECK de la BD
 * (exactamente una de las dos) se cumpla por construcción.
 */
export function resourceIdFields(kind: MaintenanceResourceKind | undefined, id: string) {
  return kind === 'other_equipment'
    ? { equipment_id: null, other_equipment_id: id }
    : { equipment_id: id, other_equipment_id: null };
}

/**
 * Condición actual del recurso.
 *
 * `vehicles.condition` y `other_equipment.condition` comparten el mismo enum
 * (`condition_enum`), así que la lectura es intercambiable: lo único que cambia
 * es de qué relación sale.
 */
export function getResourceCondition(row: WithMaintenanceResource): string | null {
  return (row.other_equipment ? row.other_equipment.condition : row.vehicles?.condition) ?? null;
}
