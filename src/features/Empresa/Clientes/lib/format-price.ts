/**
 * Importe de un ítem para mostrar. El precio viaja como texto (`Decimal(15,4)`) y solo se pasa a número acá,
 * para formatear: nunca para volver a guardarlo.
 */
const PRICE_FORMAT = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** `null` = el usuario no tiene `view_prices`: no hay importe que mostrar. */
export function formatItemPrice(value: string | null): string {
  if (value === null) return '—';
  const amount = Number(value);
  return Number.isFinite(amount) ? PRICE_FORMAT.format(amount) : '—';
}
