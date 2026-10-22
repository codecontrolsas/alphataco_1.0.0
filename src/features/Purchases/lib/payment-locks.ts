import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import type { withholding_tax } from '@/generated/prisma/enums';
import {
  PAYMENT_ORDER_STATUS_PAST,
  canApplyPaymentOrderAction,
  type PaymentOrderAction,
  type PaymentOrderStatus,
} from './payment-order-state-machine';
import { PurchaseError } from './purchase-errors';
import { formatWithholdingCertificateNumber } from './withholding-certificate-number';

/**
 * Locks y consultas de apoyo de las ordenes de pago (orden de locks: proveedor -> orden de pago ->
 * numeracion) y numeracion de certificados de retencion.
 */
type Tx = Prisma.TransactionClient;

export interface LockedSupplier {
  id: string;
  name: string;
  isActive: boolean;
  vatConditionId: number;
  cuit: bigint;
}

/** Lockea al proveedor (`FOR UPDATE`): las ordenes de pago del mismo proveedor quedan en fila. */
export async function lockSupplier(
  tx: Pick<Tx, '$queryRaw'>,
  companyId: string,
  supplierId: string
): Promise<LockedSupplier> {
  const rows = await tx.$queryRaw<
    { id: string; name: string; is_active: boolean; vat_condition_id: number; cuit: bigint }[]
  >`
    SELECT id, name, is_active, vat_condition_id, cuit FROM suppliers
    WHERE id = ${supplierId}::uuid AND company_id = ${companyId}::uuid
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new PurchaseError('El proveedor no existe');
  return { id: row.id, name: row.name, isActive: row.is_active, vatConditionId: row.vat_condition_id, cuit: row.cuit };
}

export interface LockedPaymentOrder {
  id: string;
  number: string;
  status: PaymentOrderStatus;
  supplierId: string;
  plannedOn: Date;
  netTotal: string;
}

/**
 * Lockea proveedor y orden (en ese orden) y valida la accion: "La orden OP-000007 ya fue pagada".
 */
export async function lockPaymentOrder(
  tx: Pick<Tx, '$queryRaw'>,
  companyId: string,
  orderId: string,
  action: PaymentOrderAction
): Promise<LockedPaymentOrder & { supplier: LockedSupplier }> {
  const head = await tx.$queryRaw<{ supplier_id: string }[]>`
    SELECT supplier_id FROM payment_orders WHERE id = ${orderId}::uuid AND company_id = ${companyId}::uuid
  `;
  if (!head[0]) throw new PurchaseError('La orden de pago no existe');
  const supplier = await lockSupplier(tx, companyId, head[0].supplier_id);
  const rows = await tx.$queryRaw<
    {
      id: string;
      number: string;
      status: PaymentOrderStatus;
      supplier_id: string;
      planned_on: Date;
      net_total: string;
    }[]
  >`
    SELECT id, number, status::text AS status, supplier_id, planned_on, net_total::text AS net_total
    FROM payment_orders WHERE id = ${orderId}::uuid FOR UPDATE
  `;
  const row = rows[0]!;
  if (!canApplyPaymentOrderAction(row.status, action)) {
    throw new PurchaseError(`La orden ${row.number} ya fue ${PAYMENT_ORDER_STATUS_PAST[row.status]}`);
  }
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    supplierId: row.supplier_id,
    plannedOn: row.planned_on,
    netTotal: row.net_total,
    supplier,
  };
}

/** Etapa 4: un comprobante con lineas en una orden de pago no anulada no se edita ni se anula. */
export async function assertNotInPaymentOrder(tx: Pick<Tx, '$queryRaw'>, invoiceId: string): Promise<void> {
  const number = await paymentOrderOfInvoice(tx, invoiceId);
  if (number) throw new PurchaseError(`Está en la ${number}: anulala o sacalo de ahí primero`);
}

/** Numero de la primera orden de pago no anulada (o solo pagada) que incluye al comprobante, o `null`. */
export async function paymentOrderOfInvoice(
  tx: Pick<Tx, '$queryRaw'>,
  invoiceId: string,
  options: { paidOnly?: boolean } = {}
): Promise<string | null> {
  const paidOnly = options.paidOnly ?? false;
  const rows = await tx.$queryRaw<{ number: string }[]>`
    SELECT po.number FROM payment_order_lines l JOIN payment_orders po ON po.id = l.payment_order_id
    WHERE l.invoice_id = ${invoiceId}::uuid AND po.status <> 'CANCELLED' AND (NOT ${paidOnly} OR po.status = 'PAID')
    ORDER BY po.number LIMIT 1
  `;
  return rows[0]?.number ?? null;
}

/** Siguiente numero de certificado del impuesto en la empresa (advisory lock + MAX()+1). */
export async function nextCertificateNumber(
  tx: Pick<Tx, '$queryRaw' | '$executeRaw'>,
  companyId: string,
  tax: withholding_tax
): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`withholding_certificate:${tax}:${companyId}`}, 0))`;
  const rows = await tx.$queryRaw<{ next: bigint }[]>`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(w.certificate_number, '\\D', '', 'g'), '')::bigint), 0) + 1 AS next
    FROM payment_order_withholdings w JOIN payment_orders o ON o.id = w.payment_order_id
    WHERE o.company_id = ${companyId}::uuid AND w.tax::text = ${tax} AND w.certificate_number IS NOT NULL
  `;
  return formatWithholdingCertificateNumber(tax, Number(rows[0]?.next ?? 1));
}
