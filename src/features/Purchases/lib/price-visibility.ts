/**
 * Enmascarado de importes de Compras (sin directiva: lo usan el servidor y los tipos del cliente).
 * Sin `view_prices` el importe vuelve `null` desde el servidor y la UI muestra "Sin permiso".
 * `null` NO es cero: nunca se reemplaza por 0 ni por vacío.
 */
export type PricedPurchaseTab = 'solicitudes' | 'cotizaciones' | 'ordenes' | 'recepciones';

export const NO_PRICES_PERMISSION = 'No tenés permiso para ver los importes';

/** El importe tal cual si se puede ver; si no, `null`. Único punto donde se decide el enmascarado. */
export function maskAmount<T>(value: T, canViewPrices: boolean): T | null {
  return canViewPrices ? value : null;
}
