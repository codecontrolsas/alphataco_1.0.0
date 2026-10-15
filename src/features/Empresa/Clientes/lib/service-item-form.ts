import type { ServiceItemRow } from '../actions/service-items.server';
import type { ServiceItemFormValues } from '../schemas/service-item';

/**
 * Lógica pura del formulario de items de contrato. Sin acceso a la base: `updateServiceItem`
 * espera el formulario COMPLETO, así que editar un solo campo obliga a reenviar el resto tal
 * como vino. Este módulo arma ese payload.
 */

/** Campos del item que el formulario necesita para reconstruirse. */
export type ServiceItemFormSource = Pick<
  ServiceItemRow,
  | 'item_name'
  | 'item_description'
  | 'code_item'
  | 'item_number'
  | 'item_price'
  | 'item_measure_units'
  | 'vat_rate_id'
  | 'is_active'
  | 'needs_personnel'
  | 'needs_equipment'
>;

/**
 * Valores del formulario a partir de un item existente, con `overrides` aplicados encima.
 * `item_measure_units` es el id del select y viaja como string; `is_active` nulo se considera
 * activo (es como lo muestra la tabla).
 */
export function toServiceItemFormValues(
  item: ServiceItemFormSource,
  overrides: Partial<ServiceItemFormValues> = {}
): ServiceItemFormValues {
  return {
    item_name: item.item_name,
    item_description: item.item_description,
    code_item: item.code_item,
    item_number: item.item_number,
    // Sin `view_prices` el precio llega null: se envía '0' y el servidor conserva el vigente.
    item_price: item.item_price ?? '0',
    item_measure_units: String(item.item_measure_units),
    vat_rate_id: String(item.vat_rate_id),
    is_active: item.is_active ?? true,
    needs_personnel: item.needs_personnel,
    needs_equipment: item.needs_equipment,
    ...overrides,
  };
}

/** Estado al que pasa un item al alternar su baja/alta (nulo = activo). */
export function toggledActiveState(isActive: boolean | null): boolean {
  return !(isActive ?? true);
}
