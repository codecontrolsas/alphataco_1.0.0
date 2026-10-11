import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import { formatReceiptNumber } from './receipt-number-format';
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

/** Siguiente número de recibo de cobranza de la empresa (`RE-`), con el mismo criterio. */
export async function nextReceiptNumber(tx: NumberingTx, companyId: string): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`treasury_receipt_number:${companyId}`}, 0))`;

  const rows = await tx.$queryRaw<{ next: bigint }[]>`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(number, '\\D', '', 'g'), '')::bigint), 0) + 1 AS next
    FROM customer_receipts
    WHERE company_id = ${companyId}::uuid AND number IS NOT NULL
  `;

  return formatReceiptNumber(Number(rows[0]?.next ?? 1));
}
