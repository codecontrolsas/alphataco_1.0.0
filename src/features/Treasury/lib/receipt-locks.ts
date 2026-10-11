import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { TreasuryError } from './treasury-errors';

/**
 * Locks del recibo de cobranza (spec Tesorería etapa 2 §3.7). Guardar, confirmar, anular y
 * adjuntar compiten por la fila del recibo; guardar y confirmar, además, por los comprobantes y
 * los anticipos que usan, siempre en orden de id para no cruzarse.
 */

type RawTx = Pick<Prisma.TransactionClient, '$queryRaw'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LockedReceipt = {
  id: string;
  companyId: string;
  customerId: string;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  number: string | null;
};

/** Toma la fila del recibo con `FOR UPDATE`. */
export async function lockReceipt(tx: RawTx, companyId: string, id: string): Promise<LockedReceipt> {
  if (!UUID_RE.test(id)) throw new TreasuryError('El recibo no existe');
  const rows = await tx.$queryRaw<{ id: string; company_id: string; customer_id: string; status: LockedReceipt['status']; number: string | null }[]>`
    SELECT id, company_id, customer_id, status::text AS status, number
    FROM customer_receipts
    WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new TreasuryError('El recibo no existe');
  return { id: row.id, companyId: row.company_id, customerId: row.customer_id, status: row.status, number: row.number };
}

/**
 * Bloquea comprobantes y líneas de anticipo en orden de id. Un `SELECT … FOR UPDATE` no es un
 * UPDATE: no dispara la guarda de inmutabilidad de `invoices`.
 */
export async function lockReceivables(tx: RawTx, invoiceIds: readonly string[], advanceLineIds: readonly string[]): Promise<void> {
  const invoices = [...new Set(invoiceIds)].filter((id) => UUID_RE.test(id)).sort();
  const lines = [...new Set(advanceLineIds)].filter((id) => UUID_RE.test(id)).sort();
  if (invoices.length > 0) {
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ANY(${invoices}::uuid[]) ORDER BY id FOR UPDATE`;
  }
  if (lines.length > 0) {
    await tx.$queryRaw`SELECT id FROM customer_receipt_lines WHERE id = ANY(${lines}::uuid[]) ORDER BY id FOR UPDATE`;
  }
}

/** Serializa los números de certificado de retención de un cliente (unicidad que no está en la base). */
export async function lockCustomerCertificates(tx: Pick<Prisma.TransactionClient, '$executeRaw'>, customerId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`customer_withholding_cert:${customerId}`}, 0))`;
}
