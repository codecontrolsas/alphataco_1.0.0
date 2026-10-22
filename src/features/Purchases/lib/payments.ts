import { isUuid } from '@/shared/lib/uuid';
import 'server-only';
import { computeAutomaticWithholdings } from './payment-auto-withholdings';
import { LockedSupplier } from './payment-locks';

import { supplierCheckDebts, type CheckDebtSource } from '@/features/Treasury/lib/rejected-checks';
import { Prisma } from '@/generated/prisma/client';
import type { withholding_status } from '@/generated/prisma/enums';
import { CBTE_TYPES, isCbteTypeId } from '@/shared/lib/arca/catalogs';
import type { PaymentOrderFormValues } from '../schemas/payment-orders';
import { WITHHOLDING_TAXES, WITHHOLDING_TAX_LABELS } from '../schemas/payment-settings';
import { supplierInvoiceLabel } from './invoices';
import { advanceAvailable, invoicePending } from './payment-balances';
import {
  cents,
  computePaymentTotals,
  invoiceShares,
  money,
  withholdingBases,
  type PaymentTotals,
} from './payment-totals';
import { PurchaseError } from './purchase-errors';
import { type WithholdingResult } from './withholdings';

/**
 * Ordenes de pago (spec Compras etapa 5 §3). Orden de locks: proveedor -> orden de pago ->
 * numeracion. Todo lo que lee pendientes o acumulados del mes corre con el proveedor lockeado.
 */

type Tx = Prisma.TransactionClient;

export type BuiltLine = {
  position: number;
  kind: 'INVOICE' | 'CREDIT_NOTE' | 'ADVANCE' | 'ADVANCE_APPLIED' | 'REJECTED_CHECK';
  amount: string;
  invoiceId: string | null;
  purchaseOrderId: string | null;
  description: string | null;
  sourceLineId: string | null;
  /** Cheque rechazado cuya deuda se paga: de tercero endosado (etapa 3a) o propio (etapa 3b). */
  checkId: string | null;
  /** Origen del cheque de `checkId`: decide si va a `third_party_check_id` o a `own_check_id`. */
  checkSource?: CheckDebtSource;
};

export type BuiltWithholding = WithholdingResult & { manual: boolean; supplierStatus: withholding_status | null };

export interface BuiltPaymentOrder {
  supplier: LockedSupplier;
  lines: BuiltLine[];
  withholdings: BuiltWithholding[];
  totals: PaymentTotals;
  bases: { net: string; vat: string };
}

/**
 * Valida y arma una orden de pago (alta, edicion y vista previa) con el proveedor lockeado:
 * comprobantes a pagar del proveedor y dentro de su pendiente, anticipos dentro de su disponible,
 * retenciones con el motor y el acumulado del mes, y neto ≥ 0.
 */
export async function buildPaymentOrder(
  tx: Tx,
  companyId: string,
  supplier: LockedSupplier,
  input: PaymentOrderFormValues,
  options: { orderId?: string } = {}
): Promise<BuiltPaymentOrder> {
  const excludeOrderId = options.orderId ?? null;
  const invoiceLines = input.lines.filter((l) => l.kind === 'INVOICE' || l.kind === 'CREDIT_NOTE');
  const appliedLines = input.lines.filter((l) => l.kind === 'ADVANCE_APPLIED');
  const rejectedLines = input.lines.filter((l) => l.kind === 'REJECTED_CHECK');
  const advanceAmount = input.advance.amount ? money(cents(input.advance.amount)) : '';
  if (input.lines.length === 0 && !advanceAmount)
    throw new PurchaseError('Agregá qué se paga: comprobantes o un anticipo');

  const invoiceIds = invoiceLines.map((l) => l.invoiceId);
  if (invoiceIds.some((id) => !isUuid(id))) throw new PurchaseError('El comprobante no existe');
  // Con el proveedor ya lockeado: los comprobantes se lockean FOR SHARE, en orden de id, ANTES de
  // leerlos. Asi una anulacion, un rechazo o una edicion en curso (FOR UPDATE sobre el comprobante)
  // termina primero y se lee el estado ya confirmado. Esos circuitos lockean OC -> comprobante y
  // nunca esperan al proveedor ni a la orden de pago, asi que no se forma ciclo.
  if (invoiceIds.length > 0) {
    await tx.$queryRaw`
      SELECT id FROM supplier_invoices
      WHERE id = ANY(${[...new Set(invoiceIds)]}::uuid[]) AND company_id = ${companyId}::uuid
      ORDER BY id
      FOR SHARE
    `;
  }
  const invoices = invoiceIds.length
    ? await tx.supplier_invoices.findMany({
        where: { id: { in: invoiceIds }, company_id: companyId },
        select: {
          id: true,
          supplier_id: true,
          status: true,
          cbte_type: true,
          sales_point: true,
          number: true,
          total: true,
          net_taxed: true,
          net_untaxed: true,
          exempt: true,
          vat_total: true,
        },
      })
    : [];
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const pending = await invoicePending(tx, invoiceIds, { excludeOrderId: options.orderId });

  const shares: { net: string; vat: string; amount: string }[] = [];
  const creditShares: { net: string; vat: string }[] = [];
  for (const line of invoiceLines) {
    const invoice = byId.get(line.invoiceId);
    if (!invoice || invoice.supplier_id !== supplier.id)
      throw new PurchaseError('El comprobante no existe o es de otro proveedor');
    const label = supplierInvoiceLabel(invoice);
    if (invoice.status !== 'CONFORMING' && invoice.status !== 'APPROVED')
      throw new PurchaseError(`La ${label} no está a pagar (conforme o aprobada)`);
    const isCredit = isCbteTypeId(invoice.cbte_type) && CBTE_TYPES[invoice.cbte_type].kind === 'credit_note';
    if (isCredit !== (line.kind === 'CREDIT_NOTE')) throw new PurchaseError(`La ${label} no se aplica así`);
    const amount = cents(line.amount);
    if (amount > cents(pending.get(invoice.id) ?? '0')) {
      throw new PurchaseError(`${label}: ${money(amount)} supera lo pendiente (${pending.get(invoice.id) ?? '0'})`);
    }
    const share = invoiceShares(money(amount), {
      total: invoice.total.toString(),
      netTaxed: invoice.net_taxed.toString(),
      netUntaxed: invoice.net_untaxed.toString(),
      exempt: invoice.exempt.toString(),
      vatTotal: invoice.vat_total.toString(),
    });
    if (isCredit) creditShares.push(share);
    else shares.push({ ...share, amount: money(amount) });
  }

  const sourceIds = appliedLines.map((l) => l.sourceLineId);
  if (sourceIds.some((id) => !isUuid(id))) throw new PurchaseError('El anticipo no existe');
  const advances = await advanceAvailable(tx, sourceIds, { excludeOrderId: options.orderId });
  for (const line of appliedLines) {
    const advance = advances.get(line.sourceLineId);
    if (
      !advance ||
      advance.companyId !== companyId ||
      advance.supplierId !== supplier.id ||
      advance.orderStatus !== 'PAID'
    ) {
      throw new PurchaseError('El anticipo no existe o no está pagado');
    }
    if (cents(line.amount) > cents(advance.available)) {
      throw new PurchaseError(
        `Anticipo de la ${advance.orderNumber}: ${money(cents(line.amount))} supera lo disponible (${advance.available})`
      );
    }
  }

  // Deudas por cheques de terceros endosados a este proveedor y rechazados: no llevan retenciones
  // (ya se retuvo al pagar el comprobante original), solo suman a lo que se paga.
  const checkIds = rejectedLines.map((l) => l.checkId ?? '');
  if (checkIds.some((id) => !isUuid(id)))
    throw new PurchaseError('El cheque no existe o no es una deuda de este proveedor');
  const debts = await supplierCheckDebts(tx, checkIds, { excludeOrderId: options.orderId });
  for (const line of rejectedLines) {
    const debt = debts.get(line.checkId ?? '');
    if (!debt || debt.companyId !== companyId || debt.supplierId !== supplier.id)
      throw new PurchaseError('El cheque no existe o no es una deuda de este proveedor');
    if (cents(line.amount) > cents(debt.pending))
      throw new PurchaseError(`${debt.label}: ${money(cents(line.amount))} supera la deuda (${debt.pending})`);
  }

  let purchaseOrderId: string | null = null;
  if (advanceAmount && input.advance.purchaseOrderId) {
    const po = isUuid(input.advance.purchaseOrderId)
      ? await tx.purchase_orders.findFirst({
          where: { id: input.advance.purchaseOrderId, company_id: companyId, supplier_id: supplier.id },
          select: { id: true },
        })
      : null;
    if (!po) throw new PurchaseError('La OC del anticipo no existe o es de otro proveedor');
    purchaseOrderId = po.id;
  }

  const bases = withholdingBases({
    invoices: shares,
    credits: creditShares,
    advancesApplied: appliedLines.map((l) => money(cents(l.amount))),
    advance: advanceAmount || '0',
  });

  const automatic = await computeAutomaticWithholdings(
    tx,
    companyId,
    supplier.id,
    supplier.vatConditionId,
    input.plannedOn,
    bases,
    excludeOrderId
  );
  const withholdings: BuiltWithholding[] = [];
  for (const tax of WITHHOLDING_TAXES) {
    const { regime, computed, supplierStatus } = automatic.get(tax)!;
    const manual = input.manualWithholdings.find((m) => m.tax === tax);
    if (manual) {
      const amount = cents(manual.amount);
      if (amount === BigInt(0)) continue;
      if (!regime)
        throw new PurchaseError(
          `${WITHHOLDING_TAX_LABELS[tax]}: el proveedor no tiene régimen para corregir la retención`
        );
      const base = computed?.base ?? (tax === 'IVA' ? bases.vat : bases.net);
      withholdings.push({
        tax,
        regimeId: regime.id,
        base,
        rate: computed?.rate ?? '0',
        amount: money(amount),
        detail: `Corregida a mano: ${manual.reason}${computed ? ` (calculada: ${computed.amount})` : ''}`,
        exclusionPercentage: computed?.exclusionPercentage ?? null,
        manual: true,
        supplierStatus,
      });
    } else if (computed) {
      withholdings.push({ ...computed, manual: false, supplierStatus });
    }
  }

  const totals = computePaymentTotals({
    invoices: [...shares.map((s) => s.amount), ...rejectedLines.map((l) => money(cents(l.amount)))],
    credits: invoiceLines.filter((l) => l.kind === 'CREDIT_NOTE').map((l) => money(cents(l.amount))),
    advancesApplied: appliedLines.map((l) => money(cents(l.amount))),
    advance: advanceAmount || '0',
    withholdings: withholdings.map((w) => w.amount),
  });
  if (totals.netTotal.startsWith('-')) {
    throw new PurchaseError(
      `El neto a pagar da negativo (${totals.netTotal}): las NC, anticipos y retenciones superan lo que se paga`
    );
  }

  const lines: BuiltLine[] = [
    ...invoiceLines.map((l) => ({
      kind: l.kind as 'INVOICE' | 'CREDIT_NOTE',
      amount: money(cents(l.amount)),
      invoiceId: l.invoiceId,
      purchaseOrderId: null,
      description: null,
      sourceLineId: null,
      checkId: null,
    })),
    ...appliedLines.map((l) => ({
      kind: 'ADVANCE_APPLIED' as const,
      amount: money(cents(l.amount)),
      invoiceId: null,
      purchaseOrderId: null,
      description: null,
      sourceLineId: l.sourceLineId,
      checkId: null,
    })),
    ...rejectedLines.map((l) => ({
      kind: 'REJECTED_CHECK' as const,
      amount: money(cents(l.amount)),
      invoiceId: null,
      purchaseOrderId: null,
      description: null,
      sourceLineId: null,
      checkId: l.checkId ?? null,
      checkSource: debts.get(l.checkId ?? '')?.source,
    })),
    ...(advanceAmount
      ? [
          {
            kind: 'ADVANCE' as const,
            amount: advanceAmount,
            invoiceId: null,
            purchaseOrderId,
            description: input.advance.description || null,
            sourceLineId: null,
            checkId: null,
          },
        ]
      : []),
  ].map((l, i) => ({ ...l, position: i + 1 }));

  return { supplier, lines, withholdings, totals, bases };
}

/** Lo que se escribe de una orden armada (cabecera y relaciones). */
export function paymentOrderData(built: BuiltPaymentOrder) {
  return {
    header: {
      invoices_total: new Prisma.Decimal(built.totals.invoicesTotal),
      credits_total: new Prisma.Decimal(built.totals.creditsTotal),
      advance_total: new Prisma.Decimal(built.totals.advanceTotal),
      withholdings_total: new Prisma.Decimal(built.totals.withholdingsTotal),
      net_total: new Prisma.Decimal(built.totals.netTotal),
      withholding_net_base: new Prisma.Decimal(built.bases.net),
      withholding_vat_base: new Prisma.Decimal(built.bases.vat),
    },
    lines: built.lines.map((l) => ({
      position: l.position,
      kind: l.kind,
      amount: new Prisma.Decimal(l.amount),
      invoice_id: l.invoiceId,
      purchase_order_id: l.purchaseOrderId,
      description: l.description,
      source_line_id: l.sourceLineId,
      third_party_check_id: l.checkSource === 'OWN' ? null : l.checkId,
      own_check_id: l.checkSource === 'OWN' ? l.checkId : null,
    })),
    withholdings: built.withholdings.map((w) => ({
      tax: w.tax,
      regime_id: w.regimeId,
      base: new Prisma.Decimal(w.base),
      rate: new Prisma.Decimal(w.rate),
      amount: new Prisma.Decimal(w.amount),
      detail: w.detail,
      manual: w.manual,
      supplier_status: w.supplierStatus,
      exclusion_percentage: w.exclusionPercentage === null ? null : new Prisma.Decimal(w.exclusionPercentage),
    })),
  };
}
