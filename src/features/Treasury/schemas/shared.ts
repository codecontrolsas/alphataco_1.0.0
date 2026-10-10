import { AMOUNT_SCALE, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';

/** Validaciones comunes de los formularios de Tesorería. Módulo SIN directiva. */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Importe positivo con hasta 2 decimales ("1.234,50" o "1234.50"). */
export const isPositiveAmount = (value: string) => {
  const scaled = parseScaled(value, AMOUNT_SCALE);
  return scaled !== null && scaled > BigInt(0);
};

/** Importe con signo, distinto de 0 (saldo inicial: un banco puede arrancar en descubierto). */
export const isNonZeroAmount = (value: string) => {
  const scaled = parseScaled(value, AMOUNT_SCALE);
  return scaled !== null && scaled !== BigInt(0);
};
