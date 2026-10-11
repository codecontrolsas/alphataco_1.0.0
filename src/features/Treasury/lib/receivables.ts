import 'server-only';

import { amountOf, AMOUNT_SCALE, formatScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { formatVoucherLabel } from '@/features/Comercial/Facturacion/lib/invoice-type';
import { Prisma } from '@/generated/prisma/client';
import { COLLECTABLE_CBTE_TYPES, CREDIT_NOTE_CBTE_TYPES } from './receipt-rules';

/**
 * Cobranzas (spec Tesorería etapa 2 §2.6): UNA sola definición SQL del pendiente de un
 * comprobante y del disponible de un anticipo. La usan el recibo (guardar y confirmar), "A
 * cobrar", la cuenta corriente y el detalle de la factura en Comercial (lección del 712: una
 * fórmula, no varias que divergen).
 *
 * - Pendiente (en la moneda del comprobante) = total − NC autorizadas asociadas − lo aplicado en
 *   recibos confirmados − lo reservado en recibos en borrador.
 * - Disponible de un anticipo = su importe (recibo confirmado) − lo aplicado en recibos en
 *   borrador o confirmados.
 */

type RawTx = Pick<Prisma.TransactionClient, '$queryRaw'>;

const COLLECTABLE = [...COLLECTABLE_CBTE_TYPES];
const CREDIT_NOTES = [...CREDIT_NOTE_CBTE_TYPES];

const money = (cents: bigint) => formatScaled(cents, AMOUNT_SCALE);

/**
 * Saldos de los comprobantes que cumplen `where` (sobre el alias `i` de `invoices`). Columnas:
 * id, company_id, customer_id, cbte_type, status, currency, exchange_rate, total, credited,
 * collected, reserved, pending, más sales_point, number, issue_date y due_date. La exportan las
 * tablas de "A cobrar" para no reescribir la fórmula.
 */
export function invoiceBalanceSql(where: Prisma.Sql, excludeReceiptId: string | null): Prisma.Sql {
  return Prisma.sql`
    SELECT i.id, i.company_id, i.customer_id, i.cbte_type, i.status::text AS status, i.currency::text AS currency,
           i.exchange_rate::text AS exchange_rate, i.total,
           sp.number AS sales_point, i.number, i.issue_date, i.payment_due_date AS due_date,
           COALESCE(nc.credited, 0) AS credited,
           COALESCE(ap.collected, 0) AS collected,
           COALESCE(ap.reserved, 0) AS reserved,
           i.total - COALESCE(nc.credited, 0) - COALESCE(ap.collected, 0) - COALESCE(ap.reserved, 0) AS pending
    FROM invoices i
    JOIN sales_points sp ON sp.id = i.sales_point_id
    LEFT JOIN LATERAL (
      SELECT SUM(c.total) AS credited
      FROM invoices c
      WHERE c.associated_invoice_id = i.id AND c.status = 'autorizada' AND c.cbte_type = ANY(${CREDIT_NOTES}::int[])
    ) nc ON true
    LEFT JOIN LATERAL (
      SELECT SUM(l.applied_amount) FILTER (WHERE r.status = 'CONFIRMED') AS collected,
             SUM(l.applied_amount) FILTER (
               WHERE r.status = 'DRAFT' AND (${excludeReceiptId}::uuid IS NULL OR r.id <> ${excludeReceiptId}::uuid)
             ) AS reserved
      FROM customer_receipt_lines l
      JOIN customer_receipts r ON r.id = l.receipt_id
      WHERE l.invoice_id = i.id AND l.kind = 'INVOICE'
    ) ap ON true
    WHERE ${where}
  `;
}

type BalanceRow = {
  id: string;
  company_id: string;
  customer_id: string;
  cbte_type: number;
  status: string;
  currency: string;
  exchange_rate: string;
  total: string;
  sales_point: number;
  number: number;
  issue_date: string;
  due_date: string | null;
  credited: string;
  collected: string;
  reserved: string;
  pending: string;
};

/** Envuelve `invoiceBalanceSql` serializando importes y fechas como texto. */
function balanceRowsSql(where: Prisma.Sql, excludeReceiptId: string | null, tail: Prisma.Sql = Prisma.empty): Prisma.Sql {
  return Prisma.sql`
    SELECT b.id, b.company_id, b.customer_id, b.cbte_type, b.status, b.currency, b.exchange_rate,
           b.total::numeric(15,2)::text AS total, b.sales_point, b.number,
           b.issue_date::text AS issue_date, b.due_date::text AS due_date,
           b.credited::numeric(15,2)::text AS credited, b.collected::numeric(15,2)::text AS collected,
           b.reserved::numeric(15,2)::text AS reserved, b.pending::numeric(15,2)::text AS pending
    FROM (${invoiceBalanceSql(where, excludeReceiptId)}) b
    ${tail}
  `;
}

export type InvoiceBalance = {
  invoiceId: string;
  companyId: string;
  customerId: string;
  cbteType: number;
  status: string;
  currency: string;
  exchangeRate: string;
  total: string;
  credited: string;
  collected: string;
  reserved: string;
  pending: string;
};

export type OpenCustomerInvoice = InvoiceBalance & {
  label: string;
  salesPoint: number;
  number: number;
  issueDate: string;
  dueDate: string | null;
};

function toOpen(row: BalanceRow): OpenCustomerInvoice {
  return {
    invoiceId: row.id,
    companyId: row.company_id,
    customerId: row.customer_id,
    cbteType: row.cbte_type,
    status: row.status,
    currency: row.currency.trim(),
    exchangeRate: row.exchange_rate,
    total: row.total,
    credited: row.credited,
    collected: row.collected,
    reserved: row.reserved,
    pending: row.pending,
    label: formatVoucherLabel(row.cbte_type, row.sales_point, row.number),
    salesPoint: row.sales_point,
    number: row.number,
    issueDate: row.issue_date,
    dueDate: row.due_date,
  };
}

/** Saldo de cada comprobante pedido (de cualquier tipo y estado: quien llama valida). */
export async function invoiceBalances(
  tx: RawTx,
  invoiceIds: readonly string[],
  options: { excludeReceiptId?: string } = {}
): Promise<Map<string, OpenCustomerInvoice>> {
  const ids = [...new Set(invoiceIds)];
  const result = new Map<string, OpenCustomerInvoice>();
  if (ids.length === 0) return result;
  const rows = await tx.$queryRaw<BalanceRow[]>(balanceRowsSql(Prisma.sql`i.id = ANY(${ids}::uuid[])`, options.excludeReceiptId ?? null));
  for (const row of rows) result.set(row.id, toOpen(row));
  return result;
}

/**
 * Facturas y ND autorizadas del cliente con pendiente > 0, por vencimiento (sin vencimiento al
 * final). `include`: comprobantes que se listan aunque ya no tengan pendiente (los de un borrador,
 * para que se puedan destildar si una NC los dejó en cero).
 */
export async function openInvoicesOfCustomer(
  tx: RawTx,
  companyId: string,
  customerId: string,
  options: { excludeReceiptId?: string; include?: readonly string[] } = {}
): Promise<OpenCustomerInvoice[]> {
  const where = Prisma.sql`i.company_id = ${companyId}::uuid AND i.customer_id = ${customerId}::uuid
    AND i.status = 'autorizada' AND i.cbte_type = ANY(${COLLECTABLE}::int[])`;
  const include = [...(options.include ?? [])];
  const rows = await tx.$queryRaw<BalanceRow[]>(
    balanceRowsSql(
      where,
      options.excludeReceiptId ?? null,
      Prisma.sql`WHERE b.pending > 0 OR b.id = ANY(${include}::uuid[]) ORDER BY b.due_date NULLS LAST, b.issue_date, b.number`
    )
  );
  return rows.map(toOpen);
}

/** Saldo a favor por NC posteriores al cobro: suma de los pendientes negativos, por moneda. */
export async function creditBalanceOfCustomer(tx: RawTx, companyId: string, customerId: string): Promise<Record<string, string>> {
  const where = Prisma.sql`i.company_id = ${companyId}::uuid AND i.customer_id = ${customerId}::uuid
    AND i.status = 'autorizada' AND i.cbte_type = ANY(${COLLECTABLE}::int[])`;
  const rows = await tx.$queryRaw<{ currency: string; amount: string }[]>`
    SELECT b.currency::text AS currency, (-SUM(b.pending))::numeric(15,2)::text AS amount
    FROM (${invoiceBalanceSql(where, null)}) b
    WHERE b.pending < 0
    GROUP BY b.currency
  `;
  return Object.fromEntries(rows.map((r) => [r.currency.trim(), r.amount]));
}

export type CustomerAdvanceBalance = {
  lineId: string;
  receiptId: string;
  receiptNumber: string;
  customerId: string;
  companyId: string;
  date: string;
  amount: string;
  available: string;
  description: string | null;
};

type AdvanceRow = {
  id: string;
  receipt_id: string;
  number: string;
  customer_id: string;
  company_id: string;
  date: string;
  amount: string;
  available: string;
  description: string | null;
};

function advanceSql(where: Prisma.Sql, excludeReceiptId: string | null, tail: Prisma.Sql = Prisma.empty): Prisma.Sql {
  return Prisma.sql`
    SELECT a.id, r.id AS receipt_id, r.number, r.customer_id, r.company_id, r.date::text AS date,
           a.applied_amount::text AS amount,
           (a.applied_amount - COALESCE(SUM(x.applied_amount) FILTER (
              WHERE xr.status IN ('DRAFT', 'CONFIRMED')
                AND (${excludeReceiptId}::uuid IS NULL OR xr.id <> ${excludeReceiptId}::uuid)), 0))::numeric(15,2)::text AS available,
           a.description
    FROM customer_receipt_lines a
    JOIN customer_receipts r ON r.id = a.receipt_id
    LEFT JOIN customer_receipt_lines x ON x.source_line_id = a.id
    LEFT JOIN customer_receipts xr ON xr.id = x.receipt_id
    WHERE a.kind = 'ADVANCE' AND r.status = 'CONFIRMED' AND ${where}
    GROUP BY a.id, r.id
    ${tail}
  `;
}

function toAdvance(row: AdvanceRow): CustomerAdvanceBalance {
  return {
    lineId: row.id,
    receiptId: row.receipt_id,
    receiptNumber: row.number,
    customerId: row.customer_id,
    companyId: row.company_id,
    date: row.date,
    amount: row.amount,
    available: row.available,
    description: row.description,
  };
}

/** Disponible de cada línea ADVANCE pedida (solo las de recibos confirmados). */
export async function advanceBalances(
  tx: RawTx,
  lineIds: readonly string[],
  options: { excludeReceiptId?: string } = {}
): Promise<Map<string, CustomerAdvanceBalance>> {
  const ids = [...new Set(lineIds)];
  const result = new Map<string, CustomerAdvanceBalance>();
  if (ids.length === 0) return result;
  const rows = await tx.$queryRaw<AdvanceRow[]>(advanceSql(Prisma.sql`a.id = ANY(${ids}::uuid[])`, options.excludeReceiptId ?? null));
  for (const row of rows) result.set(row.id, toAdvance(row));
  return result;
}

/** Anticipos del cliente con disponible > 0, del más viejo al más nuevo. */
export async function availableAdvancesOfCustomer(
  tx: RawTx,
  companyId: string,
  customerId: string,
  options: { excludeReceiptId?: string } = {}
): Promise<CustomerAdvanceBalance[]> {
  const rows = await tx.$queryRaw<AdvanceRow[]>(
    advanceSql(
      Prisma.sql`r.company_id = ${companyId}::uuid AND r.customer_id = ${customerId}::uuid`,
      options.excludeReceiptId ?? null,
      Prisma.sql`HAVING a.applied_amount - COALESCE(SUM(x.applied_amount) FILTER (
          WHERE xr.status IN ('DRAFT', 'CONFIRMED')
            AND (${options.excludeReceiptId ?? null}::uuid IS NULL OR xr.id <> ${options.excludeReceiptId ?? null}::uuid)), 0) > 0
        ORDER BY r.date, r.number`
    )
  );
  return rows.map(toAdvance);
}

/** Suma de los disponibles (para el encabezado de la cuenta corriente). */
export function sumAvailable(advances: CustomerAdvanceBalance[]): string {
  return money(advances.reduce((acc, a) => acc + amountOf(a.available), BigInt(0)));
}
