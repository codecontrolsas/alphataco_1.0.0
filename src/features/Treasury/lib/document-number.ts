import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import { formatTransferNumber } from './transfer-number-format';

type NumberingTx = Pick<Prisma.TransactionClient, '$executeRaw' | '$queryRaw'>;

/**
 * Siguiente número de transferencia de la empresa (`TR-`). Advisory lock de transacción por
 * empresa y `MAX()+1`: mismo criterio que la numeración de Compras.
 */
export async function nextTransferNumber(tx: NumberingTx, companyId: string): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`treasury_transfer_number:${companyId}`}, 0))`;

  const rows = await tx.$queryRaw<{ next: bigint }[]>`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '\\D', '', 'g'), '')::bigint), 0) + 1 AS next
    FROM treasury_transfers
    WHERE company_id = ${companyId}::uuid
  `;

  return formatTransferNumber(Number(rows[0]?.next ?? 1));
}
