import 'server-only';

import { supplierCheckDebts } from '@/features/Treasury/lib/rejected-checks';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { Prisma } from '@/generated/prisma/client';
import { WITHHOLDING_TAXES, WITHHOLDING_TAX_LABELS } from '../schemas/payment-settings';
import { supplierInvoiceLabel } from './invoices';
import { computeAutomaticWithholdings } from './payment-auto-withholdings';
import { advanceAvailable, invoicePending } from './payment-balances';
import type { LockedSupplier } from './payment-locks';
import { cents, money } from './payment-totals';
import { PurchaseError } from './purchase-errors';

/** Revalidaciones de una orden de pago antes de aprobarla o pagarla (saldos, anticipos y retenciones). */
type Tx = Prisma.TransactionClient;

/**
 * Antes de aprobar o pagar: los comprobantes siguen a pagar y su pendiente (sin esta orden)
 * alcanza; los anticipos aplicados siguen disponibles.
 */
export async function assertPaymentOrderStillValid(tx: Tx, companyId: string, orderId: string): Promise<void> {
  const lines = await tx.payment_order_lines.findMany({
    where: { payment_order_id: orderId },
    select: {
      kind: true,
      amount: true,
      invoice_id: true,
      source_line_id: true,
      third_party_check_id: true,
      own_check_id: true,
      invoice: { select: { status: true, cbte_type: true, sales_point: true, number: true } },
    },
  });
  const checkOf = (l: (typeof lines)[number]) => l.third_party_check_id ?? l.own_check_id;
  const checkIds = lines.flatMap((l) => (l.kind === 'REJECTED_CHECK' && checkOf(l) ? [checkOf(l) as string] : []));
  const debts = await supplierCheckDebts(tx, checkIds, { excludeOrderId: orderId });
  for (const line of lines) {
    const checkId = checkOf(line);
    if (line.kind !== 'REJECTED_CHECK' || !checkId) continue;
    const debt = debts.get(checkId);
    if (!debt || cents(line.amount.toString()) > cents(debt.pending)) {
      throw new PurchaseError(
        'La deuda de un cheque rechazado ya no alcanza para esta orden: volvé la orden a borrador'
      );
    }
  }
  const invoiceIds = lines.flatMap((l) => (l.invoice_id ? [l.invoice_id] : []));
  const pending = await invoicePending(tx, invoiceIds, { excludeOrderId: orderId });
  for (const line of lines) {
    if (line.invoice && line.invoice_id) {
      const label = supplierInvoiceLabel(line.invoice);
      if (line.invoice.status !== 'CONFORMING' && line.invoice.status !== 'APPROVED') {
        throw new PurchaseError(`La ${label} dejó de estar a pagar: resolvela o sacala de la orden`);
      }
      if (cents(line.amount.toString()) > cents(pending.get(line.invoice_id) ?? '0')) {
        throw new PurchaseError(`${label}: ya no alcanza lo pendiente para esta orden`);
      }
    }
  }
  const sources = lines.flatMap((l) => (l.source_line_id ? [l.source_line_id] : []));
  const advances = await advanceAvailable(tx, sources, { excludeOrderId: orderId });
  for (const line of lines) {
    if (!line.source_line_id) continue;
    const advance = advances.get(line.source_line_id);
    if (
      !advance ||
      advance.orderStatus !== 'PAID' ||
      advance.companyId !== companyId ||
      cents(line.amount.toString()) > cents(advance.available)
    ) {
      throw new PurchaseError('Un anticipo aplicado ya no está disponible: volvé la orden a borrador');
    }
  }
}

/**
 * Antes de aprobar y de pagar: las retenciones calculadas (no las corregidas a mano) siguen dando lo
 * mismo. Cambian si en el mes se pago otra orden del proveedor (acumulado de Ganancias), se anulo una
 * pagada, o cambiaron su situacion impositiva o el regimen: hay que volver la orden a borrador.
 */
export async function assertWithholdingsStillValid(
  tx: Tx,
  companyId: string,
  supplier: LockedSupplier,
  orderId: string
): Promise<void> {
  const order = await tx.payment_orders.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      planned_on: true,
      withholding_net_base: true,
      withholding_vat_base: true,
      withholdings: { select: { tax: true, amount: true, manual: true } },
    },
  });
  const automatic = await computeAutomaticWithholdings(
    tx,
    companyId,
    supplier.id,
    supplier.vatConditionId,
    order.planned_on.toISOString().slice(0, 10),
    { net: order.withholding_net_base.toFixed(2), vat: order.withholding_vat_base.toFixed(2) },
    orderId
  );
  for (const tax of WITHHOLDING_TAXES) {
    const stored = order.withholdings.find((w) => w.tax === tax);
    if (stored?.manual) continue;
    const now = automatic.get(tax)?.computed?.amount ?? '0.00';
    const saved = stored ? money(cents(stored.amount.toFixed(2))) : '0.00';
    if (now !== saved) {
      throw new PurchaseError(
        `La retención de ${WITHHOLDING_TAX_LABELS[tax]} cambió (en la orden ${formatMoney(saved)}, hoy ${formatMoney(now)}): ` +
          'se pagó o anuló otra orden del proveedor en el mes, o cambió su situación impositiva. Volvé la orden a borrador y guardala para recalcularla.'
      );
    }
  }
}
