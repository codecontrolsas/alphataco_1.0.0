import { formatAmountText } from '@/shared/utils/amount-text';

/**
 * Importe con su moneda para pantalla: "$ 1.234,56" en pesos y "USD 1.234,56" en otra moneda.
 * Recibe el texto de la base (sin pasar por `Number`).
 */
export function formatInCurrency(value: string, currency: string): string {
  const negative = value.startsWith('-');
  const text = formatAmountText(negative ? value.slice(1) : value);
  const symbol = currency === 'ARS' ? '$' : currency;
  return `${negative ? '-' : ''}${symbol} ${text}`;
}
