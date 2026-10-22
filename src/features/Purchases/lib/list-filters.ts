import { Prisma } from '@/generated/prisma/client';

/** Solo los dígitos de un texto ("30-71234567-8" -> "30712345678"). */
export const digitsOf = (value: string) => value.replace(/\D/g, '');

/** Importe tipeado ("1234,56" o "1234.56" o "1.234,56") -> Decimal exacto; `null` si no es un número. */
export function parseAmountFilter(text: string): Prisma.Decimal | null {
  const normalized = text
    .trim()
    .replace(/\./g, (m, _offset, s: string) => (s.includes(',') ? '' : m))
    .replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return new Prisma.Decimal(normalized);
}

/**
 * Número de comprobante: "00003-00012345" (punto de venta + número) o solo el número. Coincidencia
 * exacta. Un valor fuera de rango (punto de venta Int, número bigint) no coincide con ningún comprobante.
 */
export function voucherNumberWhere(text: string): Prisma.supplier_invoicesWhereInput | null {
  const parts = text.split('-').map(digitsOf).filter(Boolean);
  if (parts.some((p) => p.length > 18) || (parts.length === 2 && Number(parts[0]) > 99999)) return { id: { in: [] } };
  if (parts.length === 2) return { sales_point: Number(parts[0]), number: BigInt(parts[1]) };
  if (parts.length === 1) return { number: BigInt(parts[0]) };
  return null;
}
