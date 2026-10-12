import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import type { CheckStatus } from './check-transitions';

/**
 * Deudas por cheques de terceros rechazados (spec Tesorería etapa 3a §2.7): UNA sola definición
 * SQL, con el patrón de `receivables.ts`. La usan el recibo, la orden de pago, "A cobrar", los
 * vencimientos de Compras, las cuentas corrientes y el detalle del cheque.
 *
 * - Deuda del cliente = importe − líneas REJECTED_CHECK en recibos DRAFT o CONFIRMED.
 * - Deuda con el proveedor = importe − líneas REJECTED_CHECK en órdenes de pago no anuladas. Nace de un
 *   cheque de tercero rechazado estando endosado, o de un cheque propio rechazado (etapa 3b): las
 *   dos fuentes van en la misma fórmula, distinguidas por `source`.
 * Los borradores (recibos DRAFT; órdenes sin pagar) reservan: dos documentos no cobran ni pagan lo mismo.
 */

type RawTx = Pick<Prisma.TransactionClient, '$queryRaw'>;

/** De dónde viene la deuda: un cheque de tercero endosado o un cheque propio. */
export type CheckDebtSource = 'THIRD_PARTY' | 'OWN';

export type RejectedCheckDebt = {
  checkId: string;
  source: CheckDebtSource;
  companyId: string;
  /** Cliente de origen (solo cheques de terceros). */
  customerId: string | null;
  supplierId: string | null;
  number: string;
  bank: string;
  drawerName: string;
  amount: string;
  /** Fecha de la operación de rechazo vigente. */
  rejectedOn: string;
  /** Estado desde el que se rechazó (solo cheques de terceros). */
  rejectedFrom: CheckStatus | null;
  /** Lo que queda por cobrar (cliente) o pagar (proveedor). */
  pending: string;
  /** Lo reservado en documentos sin confirmar. */
  reserved: string;
  label: string;
};

type DebtRow = {
  id: string;
  source: CheckDebtSource;
  company_id: string;
  customer_id: string | null;
  supplier_id: string | null;
  number: string;
  bank: string;
  drawer_name: string;
  amount: string;
  rejected_on: string;
  rejected_from: CheckStatus | null;
  reserved: string;
  pending: string;
};

/** "Cheque rechazado Nº 123 — BANCO GALICIA". */
export const rejectedCheckLabel = (number: string, bank: string) => `Cheque rechazado Nº ${number} — ${bank}`;

/** "Cheque propio rechazado Nº 1234 — BANCO GALICIA". */
export const rejectedOwnCheckLabel = (number: string, bank: string) => `Cheque propio rechazado Nº ${number} — ${bank}`;

/** Fecha del rechazo vigente del cheque (alias `c`). */
const REJECTED_ON = Prisma.sql`
  COALESCE(
    (SELECT o.date FROM third_party_check_operation_items i
       JOIN third_party_check_operations o ON o.id = i.operation_id
      WHERE i.check_id = c.id AND o.kind = 'REJECTION' AND o.cancelled_at IS NULL
      ORDER BY o.created_at DESC LIMIT 1),
    (c.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
  )`;

/**
 * Deuda del cliente de los cheques rechazados que cumplen `where` (sobre el alias `c` de
 * `third_party_checks`). Columnas: las de `DebtRow`. La exportan las tablas para no reescribir la fórmula.
 */
export function customerCheckDebtSql(where: Prisma.Sql, excludeReceiptId: string | null): Prisma.Sql {
  return Prisma.sql`
    SELECT c.id, 'THIRD_PARTY' AS source, c.company_id, c.customer_id, c.supplier_id, c.number, c.bank, c.drawer_name,
           c.amount::numeric(15,2)::text AS amount, (${REJECTED_ON})::text AS rejected_on, c.rejected_from::text AS rejected_from,
           COALESCE(ap.reserved, 0)::numeric(15,2)::text AS reserved,
           (c.amount - COALESCE(ap.collected, 0) - COALESCE(ap.reserved, 0))::numeric(15,2)::text AS pending
    FROM third_party_checks c
    LEFT JOIN LATERAL (
      SELECT SUM(l.applied_amount) FILTER (WHERE r.status = 'CONFIRMED') AS collected,
             SUM(l.applied_amount) FILTER (
               WHERE r.status = 'DRAFT' AND (${excludeReceiptId}::uuid IS NULL OR r.id <> ${excludeReceiptId}::uuid)
             ) AS reserved
      FROM customer_receipt_lines l
      JOIN customer_receipts r ON r.id = l.receipt_id
      WHERE l.third_party_check_id = c.id AND l.kind = 'REJECTED_CHECK'
    ) ap ON true
    WHERE c.status = 'REJECTED' AND ${where}
  `;
}

/** Lo pagado (órdenes PAID) y reservado (sin pagar) de las líneas REJECTED_CHECK de `column` = `id`. */
function supplierApplied(column: Prisma.Sql, id: Prisma.Sql, excludeOrderId: string | null): Prisma.Sql {
  return Prisma.sql`
    SELECT SUM(l.amount) FILTER (WHERE po.status = 'PAID') AS paid,
           SUM(l.amount) FILTER (
             WHERE po.status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED') AND (${excludeOrderId}::uuid IS NULL OR po.id <> ${excludeOrderId}::uuid)
           ) AS reserved
    FROM payment_order_lines l
    JOIN payment_orders po ON po.id = l.payment_order_id
    WHERE ${column} = ${id} AND l.kind = 'REJECTED_CHECK'
  `;
}

/**
 * Deuda con el proveedor de los cheques rechazados que cumplen `where`, sobre el alias `c` con las
 * columnas `company_id`, `supplier_id` y `id`: los de terceros endosados y los propios (etapa 3b).
 */
export function supplierCheckDebtSql(where: Prisma.Sql, excludeOrderId: string | null): Prisma.Sql {
  return Prisma.sql`
    SELECT c.id, 'THIRD_PARTY' AS source, c.company_id, c.customer_id, c.supplier_id, c.number, c.bank, c.drawer_name,
           c.amount::numeric(15,2)::text AS amount, (${REJECTED_ON})::text AS rejected_on, c.rejected_from::text AS rejected_from,
           COALESCE(ap.reserved, 0)::numeric(15,2)::text AS reserved,
           (c.amount - COALESCE(ap.paid, 0) - COALESCE(ap.reserved, 0))::numeric(15,2)::text AS pending
    FROM third_party_checks c
    LEFT JOIN LATERAL (${supplierApplied(Prisma.sql`l.third_party_check_id`, Prisma.sql`c.id`, excludeOrderId)}) ap ON true
    WHERE c.status = 'REJECTED' AND c.rejected_from = 'ENDORSED' AND ${where}
    UNION ALL
    SELECT c.id, 'OWN' AS source, c.company_id, NULL::uuid AS customer_id, c.supplier_id, c.number,
           UPPER(COALESCE(NULLIF(TRIM(a.bank_name), ''), a.name)) AS bank, co.company_name AS drawer_name,
           c.amount::numeric(15,2)::text AS amount, c.rejected_on::text AS rejected_on, NULL::text AS rejected_from,
           COALESCE(ap.reserved, 0)::numeric(15,2)::text AS reserved,
           (c.amount - COALESCE(ap.paid, 0) - COALESCE(ap.reserved, 0))::numeric(15,2)::text AS pending
    FROM own_checks c
    JOIN treasury_accounts a ON a.id = c.account_id
    JOIN company co ON co.id = c.company_id
    LEFT JOIN LATERAL (${supplierApplied(Prisma.sql`l.own_check_id`, Prisma.sql`c.id`, excludeOrderId)}) ap ON true
    WHERE c.status = 'REJECTED' AND ${where}
  `;
}

function toDebt(row: DebtRow): RejectedCheckDebt {
  return {
    checkId: row.id,
    source: row.source,
    companyId: row.company_id,
    customerId: row.customer_id,
    supplierId: row.supplier_id,
    number: row.number,
    bank: row.bank,
    drawerName: row.drawer_name,
    amount: row.amount,
    rejectedOn: row.rejected_on,
    rejectedFrom: row.rejected_from,
    pending: row.pending,
    reserved: row.reserved,
    label: row.source === 'OWN' ? rejectedOwnCheckLabel(row.number, row.bank) : rejectedCheckLabel(row.number, row.bank),
  };
}

const byIds = (ids: readonly string[]) => Prisma.sql`c.id = ANY(${[...new Set(ids)]}::uuid[])`;

export async function customerCheckDebts(
  tx: RawTx,
  checkIds: readonly string[],
  options: { excludeReceiptId?: string } = {}
): Promise<Map<string, RejectedCheckDebt>> {
  if (checkIds.length === 0) return new Map();
  const rows = await tx.$queryRaw<DebtRow[]>(customerCheckDebtSql(byIds(checkIds), options.excludeReceiptId ?? null));
  return new Map(rows.map((r) => [r.id, toDebt(r)]));
}

/** Deudas del cliente con pendiente > 0 (o las de `include`, para que un borrador las pueda destildar), por fecha de rechazo. */
export async function openCheckDebtsOfCustomer(
  tx: RawTx,
  companyId: string,
  customerId: string,
  options: { excludeReceiptId?: string; include?: readonly string[] } = {}
): Promise<RejectedCheckDebt[]> {
  const include = [...(options.include ?? [])];
  const rows = await tx.$queryRaw<DebtRow[]>`
    SELECT d.* FROM (${customerCheckDebtSql(
      Prisma.sql`c.company_id = ${companyId}::uuid AND c.customer_id = ${customerId}::uuid`,
      options.excludeReceiptId ?? null
    )}) d
    WHERE d.pending::numeric > 0 OR d.id = ANY(${include}::uuid[])
    ORDER BY d.rejected_on, d.number
  `;
  return rows.map(toDebt);
}

export async function supplierCheckDebts(
  tx: RawTx,
  checkIds: readonly string[],
  options: { excludeOrderId?: string } = {}
): Promise<Map<string, RejectedCheckDebt>> {
  if (checkIds.length === 0) return new Map();
  const rows = await tx.$queryRaw<DebtRow[]>(supplierCheckDebtSql(byIds(checkIds), options.excludeOrderId ?? null));
  return new Map(rows.map((r) => [r.id, toDebt(r)]));
}

/** Deudas con el proveedor con pendiente > 0 (o las de `include`; con `includeSettled`, todas: la cuenta corriente), por fecha de rechazo. */
export async function openCheckDebtsOfSupplier(
  tx: RawTx,
  companyId: string,
  supplierId: string,
  options: { excludeOrderId?: string; include?: readonly string[]; includeSettled?: boolean } = {}
): Promise<RejectedCheckDebt[]> {
  const include = [...(options.include ?? [])];
  const settled = options.includeSettled ?? false;
  const rows = await tx.$queryRaw<DebtRow[]>`
    SELECT d.* FROM (${supplierCheckDebtSql(
      Prisma.sql`c.company_id = ${companyId}::uuid AND c.supplier_id = ${supplierId}::uuid`,
      options.excludeOrderId ?? null
    )}) d
    WHERE ${settled} OR d.pending::numeric > 0 OR d.id = ANY(${include}::uuid[])
    ORDER BY d.rejected_on, d.number
  `;
  return rows.map(toDebt);
}
