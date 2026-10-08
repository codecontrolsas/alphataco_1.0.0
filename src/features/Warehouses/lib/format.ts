/**
 * Formato de cantidades e importes para pantalla (es-AR). Los numeros llegan como string desde
 * el servidor (Decimal serializado) y se formatean sin pasar por aritmetica de punto flotante
 * mas alla de la presentacion.
 */
const quantityFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 });
const moneyFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
const costFormat = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function formatQuantity(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  return quantityFormat.format(Number(value));
}

/** Importe total (2 decimales). */
export function formatMoney(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  return moneyFormat.format(Number(value));
}

/** Costo unitario (hasta 4 decimales). */
export function formatUnitCost(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  return costFormat.format(Number(value));
}
