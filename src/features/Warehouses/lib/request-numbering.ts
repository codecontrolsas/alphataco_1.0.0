import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

type NumberingTx = Pick<Prisma.TransactionClient, '$executeRaw' | '$queryRaw'>;

/**
 * Siguiente `material_requests.number` de la empresa (`PED-000001`). Mismo criterio que
 * `nextStockMovementNumber`: advisory lock de transaccion por empresa y `MAX()+1`. Su clave de
 * lock es otra, asi que no compite con la numeracion de movimientos.
 */
export async function nextMaterialRequestNumber(tx: NumberingTx, companyId: string): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`material_request_number:${companyId}`}, 0))`;

  const rows = await tx.$queryRaw<{ next: bigint }[]>`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '\\D', '', 'g'), '')::bigint), 0) + 1 AS next
    FROM material_requests
    WHERE company_id = ${companyId}::uuid
  `;

  return `PED-${String(Number(rows[0]?.next ?? 1)).padStart(6, '0')}`;
}
