import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

type NumberingTx = Pick<Prisma.TransactionClient, '$executeRaw' | '$queryRaw'>;

/**
 * Siguiente `stock_movements.number` de la empresa, con formato `MOV-000001`.
 *
 * Mismo criterio que `Mantenimiento/shared/order-numbering.ts`: advisory lock de transaccion
 * por empresa y despues `MAX()+1`, asi dos movimientos simultaneos no reciben el mismo numero.
 * El `@@unique([company_id, number])` queda como red; un movimiento de stock no puede fallar
 * por colision de numero y pedirle al usuario que reintente.
 *
 * Es el ULTIMO lock que toma el motor (despues de materiales, saldos y unidades): ver el
 * orden de locks en `stock-engine.ts`.
 */
export async function nextStockMovementNumber(tx: NumberingTx, companyId: string): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`stock_movement_number:${companyId}`}, 0))`;

  const rows = await tx.$queryRaw<{ next: bigint }[]>`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '\\D', '', 'g'), '')::bigint), 0) + 1 AS next
    FROM stock_movements
    WHERE company_id = ${companyId}::uuid
  `;

  return `MOV-${String(Number(rows[0]?.next ?? 1)).padStart(6, '0')}`;
}
