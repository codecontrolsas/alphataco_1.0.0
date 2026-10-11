import 'server-only';

import { formatVoucherLabel } from '@/features/Comercial/Facturacion/lib/invoice-type';
import { Prisma } from '@/generated/prisma/client';
import { buildCustomerStatement, type CustomerStatementCurrency, type CustomerStatementEntry } from './customer-statement-math';
import { COLLECTABLE_CBTE_TYPES, CREDIT_NOTE_CBTE_TYPES } from './receipt-rules';
import { availableAdvancesOfCustomer, creditBalanceOfCustomer, sumAvailable } from './receivables';
import { TreasuryError } from './treasury-errors';

/**
 * Cuenta corriente del cliente (spec Tesorería etapa 2 §3.6). Una consulta para el saldo
 * anterior y otra para el período, sobre la misma unión de orígenes:
 * - comprobantes autorizados: facturas y ND al debe, NC al haber;
 * - líneas de recibos CONFIRMADOS: lo cobrado al haber (en la moneda del comprobante), lo cobrado
 *   a cuenta al haber y los anticipos aplicados al debe (en pesos).
 */

type StatementDb = Pick<Prisma.TransactionClient, '$queryRaw' | 'customers'>;

const COLLECTABLE = [...COLLECTABLE_CBTE_TYPES];
const CREDIT_NOTES = [...CREDIT_NOTE_CBTE_TYPES];
const DEBIT_NOTES = [2, 7, 12];

function entriesSql(companyId: string, customerId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT i.id::text AS id, i.issue_date AS date, i.currency::text AS currency,
           CASE WHEN i.cbte_type = ANY(${CREDIT_NOTES}::int[]) THEN 'CREDIT_NOTE'
                WHEN i.cbte_type = ANY(${DEBIT_NOTES}::int[]) THEN 'DEBIT_NOTE' ELSE 'INVOICE' END AS kind,
           i.cbte_type, sp.number AS sales_point, i.number, NULL::text AS receipt_number, NULL::uuid AS receipt_id,
           CASE WHEN i.cbte_type = ANY(${CREDIT_NOTES}::int[]) THEN 0 ELSE i.total END AS debit,
           CASE WHEN i.cbte_type = ANY(${CREDIT_NOTES}::int[]) THEN i.total ELSE 0 END AS credit
    FROM invoices i
    JOIN sales_points sp ON sp.id = i.sales_point_id
    WHERE i.company_id = ${companyId}::uuid AND i.customer_id = ${customerId}::uuid AND i.status = 'autorizada'
      AND (i.cbte_type = ANY(${COLLECTABLE}::int[]) OR i.cbte_type = ANY(${CREDIT_NOTES}::int[]))
    UNION ALL
    SELECT l.id::text, r.date, l.currency::text,
           CASE l.kind WHEN 'INVOICE' THEN 'RECEIPT' WHEN 'ADVANCE' THEN 'ADVANCE' ELSE 'ADVANCE_APPLIED' END,
           i.cbte_type, sp.number, i.number, r.number, r.id,
           CASE WHEN l.kind = 'ADVANCE_APPLIED' THEN l.applied_amount ELSE 0 END,
           CASE WHEN l.kind = 'ADVANCE_APPLIED' THEN 0 ELSE l.applied_amount END
    FROM customer_receipt_lines l
    JOIN customer_receipts r ON r.id = l.receipt_id
    LEFT JOIN invoices i ON i.id = l.invoice_id
    LEFT JOIN sales_points sp ON sp.id = i.sales_point_id
    WHERE r.company_id = ${companyId}::uuid AND r.customer_id = ${customerId}::uuid AND r.status = 'CONFIRMED'
  `;
}

type EntryRow = {
  id: string;
  date: string;
  currency: string;
  kind: CustomerStatementEntry['kind'];
  cbte_type: number | null;
  sales_point: number | null;
  number: number | null;
  receipt_number: string | null;
  receipt_id: string | null;
  debit: string;
  credit: string;
};

function toEntry(row: EntryRow): CustomerStatementEntry {
  const voucher = row.cbte_type !== null && row.sales_point !== null ? formatVoucherLabel(row.cbte_type, row.sales_point, row.number) : null;
  const isReceipt = row.receipt_id !== null;
  const label = !isReceipt
    ? (voucher ?? '')
    : row.kind === 'RECEIPT'
      ? `${row.receipt_number} · ${voucher ?? ''}`
      : row.kind === 'ADVANCE'
        ? `${row.receipt_number} · Cobro a cuenta`
        : `${row.receipt_number} · Aplicación de anticipo`;
  return {
    id: row.id,
    date: row.date,
    currency: row.currency.trim(),
    kind: row.kind,
    label,
    href: isReceipt ? `/dashboard/treasury/receipts/${row.receipt_id}` : `/dashboard/comercial/facturacion/${row.id}`,
    debit: row.debit,
    credit: row.credit,
  };
}

export async function getCustomerStatement(
  db: StatementDb,
  companyId: string,
  customerId: string,
  from: string,
  to: string
): Promise<{
  customer: { id: string; name: string; cuit: string };
  currencies: CustomerStatementCurrency[];
  advancesAvailable: string;
  creditBalance: Record<string, string>;
}> {
  const customer = await db.customers.findFirst({ where: { id: customerId, company_id: companyId }, select: { id: true, name: true, cuit: true } });
  if (!customer) throw new TreasuryError('El cliente no existe');

  const entries = entriesSql(companyId, customerId);
  const [previousRows, rows, advances, creditBalance] = await Promise.all([
    db.$queryRaw<{ currency: string; balance: string }[]>`
      SELECT e.currency, SUM(e.debit - e.credit)::numeric(15,2)::text AS balance
      FROM (${entries}) e
      WHERE e.date < ${from}::date
      GROUP BY e.currency
    `,
    db.$queryRaw<EntryRow[]>`
      SELECT e.id, e.date::text AS date, e.currency, e.kind, e.cbte_type, e.sales_point, e.number, e.receipt_number, e.receipt_id,
             e.debit::numeric(15,2)::text AS debit, e.credit::numeric(15,2)::text AS credit
      FROM (${entries}) e
      WHERE e.date >= ${from}::date AND e.date <= ${to}::date
    `,
    availableAdvancesOfCustomer(db, companyId, customerId),
    creditBalanceOfCustomer(db, companyId, customerId),
  ]);

  const previous = Object.fromEntries(previousRows.map((r) => [r.currency.trim(), r.balance]));
  return {
    customer: { id: customer.id, name: customer.name, cuit: customer.cuit.toString() },
    currencies: buildCustomerStatement(previous, rows.map(toEntry)),
    advancesAvailable: sumAvailable(advances),
    creditBalance,
  };
}
