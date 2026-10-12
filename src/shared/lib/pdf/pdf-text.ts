import { formatAmountText } from '@/shared/utils/amount-text';
import moment from 'moment';

/**
 * Formatos de texto que comparten los builders de datos de los PDF (Compras, Certificaciones).
 * Puros: reciben texto y devuelven texto.
 */

/** `YYYY-MM-DD` → `DD/MM/YYYY`. */
export const pdfDateText = (value: string) => moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY');

/** Partes de un domicilio unidas por coma, salteando las vacías; `null` si no queda ninguna. */
export function joinAddress(parts: (string | null)[]): string | null {
  const clean = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return clean.length > 0 ? clean.join(', ') : null;
}

/** Precio unitario sin moneda: 2 decimales, o 4 si los tiene (los precios se guardan a 4). */
export function unitAmountText(value: string): string {
  const decimals = (value.split('.')[1] ?? '').replace(/0+$/, '');
  return formatAmountText(value, decimals.length > 2 ? 4 : 2);
}
