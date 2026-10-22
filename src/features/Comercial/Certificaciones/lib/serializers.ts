import type { Prisma } from '@/generated/prisma/client';

/** Certificación de listado: sólo el total es `Decimal`. */
export function serializeCertification<T extends { total: Prisma.Decimal }>(row: T): Omit<T, 'total'> & { total: string } {
  return { ...row, total: row.total.toString() };
}

/** Línea de certificación: cantidad, precio unitario congelado e importe. */
export function serializeCertificationLine<
  T extends { quantity: Prisma.Decimal; unit_price: Prisma.Decimal; amount: Prisma.Decimal },
>(line: T): Omit<T, 'quantity' | 'unit_price' | 'amount'> & { quantity: string; unit_price: string; amount: string } {
  return {
    ...line,
    quantity: line.quantity.toString(),
    unit_price: line.unit_price.toString(),
    amount: line.amount.toString(),
  };
}
