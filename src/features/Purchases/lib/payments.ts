import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import type { withholding_status, withholding_tax } from '@/generated/prisma/enums';
import { CBTE_TYPES, isCbteTypeId } from '@/shared/lib/arca/catalogs';
import type { PaymentOrderFormValues } from '../schemas/payment-orders';
import { WITHHOLDING_TAXES, WITHHOLDING_TAX_LABELS } from '../schemas/payment-settings';
import { supplierInvoiceLabel } from './invoices';
import { advanceAvailable, invoicePending } from './payment-balances';
import { supplierCheckDebts, type CheckDebtSource } from '@/features/Treasury/lib/rejected-checks';
import {
  PAYMENT_ORDER_STATUS_PAST,
  canApplyPaymentOrderAction,
  type PaymentOrderAction,
  type PaymentOrderStatus,
} from './payment-order-state-machine';
import { cents, computePaymentTotals, invoiceShares, money, withholdingBases, type PaymentTotals } from './payment-totals';
import { PurchaseError } from './purchase-errors';
import { formatWithholdingCertificateNumber } from './withholding-certificate-number';
import { formatMoney } from '@/features/Warehouses/lib/format';
import { computeWithholding, type WithholdingRegime, type WithholdingResult } from './withholdings';

/**
 * Ordenes de pago (spec Compras etapa 5 §3). Orden de locks: proveedor -> orden de pago ->
 * numeracion. Todo lo que lee pendientes o acumulados del mes corre con el proveedor lockeado.
 */

type Tx = Prisma.TransactionClient;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LockedSupplier {
  id: string;
  name: string;
  isActive: boolean;
  vatConditionId: number;
  cuit: bigint;
}

/** Lockea al proveedor (`FOR UPDATE`): las ordenes de pago del mismo proveedor quedan en fila. */
export async function lockSupplier(tx: Pick<Tx, '$queryRaw'>, companyId: string, supplierId: string): Promise<LockedSupplier> {
  const rows = await tx.$queryRaw<{ id: string; name: string; is_active: boolean; vat_condition_id: number; cuit: bigint }[]>`
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
    { id: string; number: string; status: PaymentOrderStatus; supplier_id: string; planned_on: Date; net_total: string }[]
  >`
    SELECT id, number, status::text AS status, supplier_id, planned_on, net_total::text AS net_total
    FROM payment_orders WHERE id = ${orderId}::uuid FOR UPDATE
  `;
  const row = rows[0]!;
  if (!canApplyPaymentOrderAction(row.status, action)) {
    throw new PurchaseError(`La orden ${row.number} ya fue ${PAYMENT_ORDER_STATUS_PAST[row.status]}`);
  }
  return { id: row.id, number: row.number, status: row.status, supplierId: row.supplier_id, plannedOn: row.planned_on, netTotal: row.net_total, supplier };
}

/** Etapa 4: un comprobante con lineas en una orden de pago no anulada no se edita ni se anula. */
export async function assertNotInPaymentOrder(tx: Pick<Tx, '$queryRaw'>, invoiceId: string): Promise<void> {
  const number = await paymentOrderOfInvoice(tx, invoiceId);
  if (number) throw new PurchaseError(`Está en la ${number}: anulala o sacalo de ahí primero`);
}

/** Numero de la primera orden de pago no anulada (o solo pagada) que incluye al comprobante, o `null`. */
export async function paymentOrderOfInvoice(tx: Pick<Tx, '$queryRaw'>, invoiceId: string, options: { paidOnly?: boolean } = {}): Promise<string | null> {
  const paidOnly = options.paidOnly ?? false;
  const rows = await tx.$queryRaw<{ number: string }[]>`
    SELECT po.number FROM payment_order_lines l JOIN payment_orders po ON po.id = l.payment_order_id
    WHERE l.invoice_id = ${invoiceId}::uuid AND po.status <> 'CANCELLED' AND (NOT ${paidOnly} OR po.status = 'PAID')
    ORDER BY po.number LIMIT 1
  `;
  return rows[0]?.number ?? null;
}

/** Siguiente numero de certificado del impuesto en la empresa (advisory lock + MAX()+1). */
export async function nextCertificateNumber(tx: Pick<Tx, '$queryRaw' | '$executeRaw'>, companyId: string, tax: withholding_tax): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`withholding_certificate:${tax}:${companyId}`}, 0))`;
  const rows = await tx.$queryRaw<{ next: bigint }[]>`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(w.certificate_number, '\\D', '', 'g'), '')::bigint), 0) + 1 AS next
    FROM payment_order_withholdings w JOIN payment_orders o ON o.id = w.payment_order_id
    WHERE o.company_id = ${companyId}::uuid AND w.tax::text = ${tax} AND w.certificate_number IS NOT NULL
  `;
  return formatWithholdingCertificateNumber(tax, Number(rows[0]?.next ?? 1));
}

const decimalToText = (d: Prisma.Decimal | null) => (d === null ? null : d.toString());

/** Ganancias: bases y retenciones de las ordenes pagadas del proveedor en el mes de `date`. */
async function gananciasMonth(tx: Pick<Tx, '$queryRaw'>, supplierId: string, date: string, excludeOrderId: string | null) {
  const rows = await tx.$queryRaw<{ base: string | null; withheld: string | null }[]>`
    SELECT (SELECT SUM(o.withholding_net_base) FROM payment_orders o
             WHERE o.supplier_id = ${supplierId}::uuid AND o.status = 'PAID'
               AND date_trunc('month', o.paid_on) = date_trunc('month', ${date}::date)
               AND (${excludeOrderId}::uuid IS NULL OR o.id <> ${excludeOrderId}::uuid))::text AS base,
           (SELECT SUM(w.amount) FROM payment_order_withholdings w JOIN payment_orders o ON o.id = w.payment_order_id
             WHERE o.supplier_id = ${supplierId}::uuid AND o.status = 'PAID' AND w.tax = 'GANANCIAS' AND w.cancelled_at IS NULL
               AND date_trunc('month', o.paid_on) = date_trunc('month', ${date}::date)
               AND (${excludeOrderId}::uuid IS NULL OR o.id <> ${excludeOrderId}::uuid))::text AS withheld
  `;
  return { previousBase: rows[0]?.base ?? '0', previousWithheld: rows[0]?.withheld ?? '0' };
}

type AutomaticWithholding = { regime: WithholdingRegime | null; computed: WithholdingResult | null; supplierStatus: withholding_status | null };

/**
 * Retenciones que calcula el motor (sin correcciones manuales) para un proveedor, una fecha y unas
 * bases. Lo usan el armado de la orden y la revalidacion antes de aprobar y pagar.
 */
async function computeAutomaticWithholdings(
  tx: Tx,
  companyId: string,
  supplierId: string,
  vatConditionId: number,
  plannedOn: string,
  bases: { net: string; vat: string },
  excludeOrderId: string | null
): Promise<Map<withholding_tax, AutomaticWithholding>> {
  // Retenciones: perfiles del proveedor con su regimen; IIBB puede no tener regimen (solo padron).
  const [profiles, regimes] = await Promise.all([
    tx.supplier_withholding_profiles.findMany({ where: { supplier_id: supplierId } }),
    tx.withholding_regimes.findMany({ where: { company_id: companyId }, orderBy: { code: 'asc' } }),
  ]);
  const regimeOf = (id: string | null): WithholdingRegime | null => {
    const r = id ? regimes.find((x) => x.id === id) : undefined;
    if (!r) return null;
    return {
      id: r.id,
      code: r.code,
      description: r.description,
      rateRegistered: r.rate_registered.toString(),
      rateUnregistered: decimalToText(r.rate_unregistered),
      monthlyExemptAmount: r.monthly_exempt_amount.toString(),
      minimumWithholding: r.minimum_withholding.toString(),
      scale: Array.isArray(r.scale) ? (r.scale as WithholdingRegime['scale']) : null,
      vatPercentage: decimalToText(r.vat_percentage),
      isActive: r.is_active,
    };
  };

  const month = await gananciasMonth(tx, supplierId, plannedOn, excludeOrderId);
  const result = new Map<withholding_tax, AutomaticWithholding>();
  for (const tax of WITHHOLDING_TAXES) {
    const p = profiles.find((x) => x.tax === tax);
    // IIBB sin regimen: alicuota de padron con un regimen "virtual" no se admite: hace falta un
    // regimen para el codigo del archivo. Se usa el primero activo de IIBB.
    const regime = regimeOf(p?.regime_id ?? (tax === 'IIBB' ? (regimes.find((r) => r.tax === 'IIBB' && r.is_active)?.id ?? null) : null));
    const computed = computeWithholding({
      tax,
      date: plannedOn,
      regime,
      profile: p
        ? {
            status: p.status,
            rate: decimalToText(p.rate),
            exclusion:
              p.exclusion_percentage && p.exclusion_from && p.exclusion_to
                ? {
                    percentage: p.exclusion_percentage.toString(),
                    from: p.exclusion_from.toISOString().slice(0, 10),
                    to: p.exclusion_to.toISOString().slice(0, 10),
                  }
                : null,
          }
        : null,
      netBase: bases.net,
      vatBase: bases.vat,
      supplierIsRegistered: vatConditionId === 1,
      month,
    });
    result.set(tax, { regime, computed, supplierStatus: p?.status ?? null });
  }
  return result;
}

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
  if (input.lines.length === 0 && !advanceAmount) throw new PurchaseError('Agregá qué se paga: comprobantes o un anticipo');

  const invoiceIds = invoiceLines.map((l) => l.invoiceId);
  if (invoiceIds.some((id) => !UUID_RE.test(id))) throw new PurchaseError('El comprobante no existe');
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
    if (!invoice || invoice.supplier_id !== supplier.id) throw new PurchaseError('El comprobante no existe o es de otro proveedor');
    const label = supplierInvoiceLabel(invoice);
    if (invoice.status !== 'CONFORMING' && invoice.status !== 'APPROVED') throw new PurchaseError(`La ${label} no está a pagar (conforme o aprobada)`);
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
  if (sourceIds.some((id) => !UUID_RE.test(id))) throw new PurchaseError('El anticipo no existe');
  const advances = await advanceAvailable(tx, sourceIds, { excludeOrderId: options.orderId });
  for (const line of appliedLines) {
    const advance = advances.get(line.sourceLineId);
    if (!advance || advance.companyId !== companyId || advance.supplierId !== supplier.id || advance.orderStatus !== 'PAID') {
      throw new PurchaseError('El anticipo no existe o no está pagado');
    }
    if (cents(line.amount) > cents(advance.available)) {
      throw new PurchaseError(`Anticipo de la ${advance.orderNumber}: ${money(cents(line.amount))} supera lo disponible (${advance.available})`);
    }
  }

  // Deudas por cheques de terceros endosados a este proveedor y rechazados: no llevan retenciones
  // (ya se retuvo al pagar el comprobante original), solo suman a lo que se paga.
  const checkIds = rejectedLines.map((l) => l.checkId ?? '');
  if (checkIds.some((id) => !UUID_RE.test(id))) throw new PurchaseError('El cheque no existe o no es una deuda de este proveedor');
  const debts = await supplierCheckDebts(tx, checkIds, { excludeOrderId: options.orderId });
  for (const line of rejectedLines) {
    const debt = debts.get(line.checkId ?? '');
    if (!debt || debt.companyId !== companyId || debt.supplierId !== supplier.id) throw new PurchaseError('El cheque no existe o no es una deuda de este proveedor');
    if (cents(line.amount) > cents(debt.pending)) throw new PurchaseError(`${debt.label}: ${money(cents(line.amount))} supera la deuda (${debt.pending})`);
  }

  let purchaseOrderId: string | null = null;
  if (advanceAmount && input.advance.purchaseOrderId) {
    const po = UUID_RE.test(input.advance.purchaseOrderId)
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

  const automatic = await computeAutomaticWithholdings(tx, companyId, supplier.id, supplier.vatConditionId, input.plannedOn, bases, excludeOrderId);
  const withholdings: BuiltWithholding[] = [];
  for (const tax of WITHHOLDING_TAXES) {
    const { regime, computed, supplierStatus } = automatic.get(tax)!;
    const manual = input.manualWithholdings.find((m) => m.tax === tax);
    if (manual) {
      const amount = cents(manual.amount);
      if (amount === BigInt(0)) continue;
      if (!regime) throw new PurchaseError(`${WITHHOLDING_TAX_LABELS[tax]}: el proveedor no tiene régimen para corregir la retención`);
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
    throw new PurchaseError(`El neto a pagar da negativo (${totals.netTotal}): las NC, anticipos y retenciones superan lo que se paga`);
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
      ? [{ kind: 'ADVANCE' as const, amount: advanceAmount, invoiceId: null, purchaseOrderId, description: input.advance.description || null, sourceLineId: null, checkId: null }]
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
      throw new PurchaseError('La deuda de un cheque rechazado ya no alcanza para esta orden: volvé la orden a borrador');
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
    if (!advance || advance.orderStatus !== 'PAID' || advance.companyId !== companyId || cents(line.amount.toString()) > cents(advance.available)) {
      throw new PurchaseError('Un anticipo aplicado ya no está disponible: volvé la orden a borrador');
    }
  }
}

/**
 * Antes de aprobar y de pagar: las retenciones calculadas (no las corregidas a mano) siguen dando lo
 * mismo. Cambian si en el mes se pago otra orden del proveedor (acumulado de Ganancias), se anulo una
 * pagada, o cambiaron su situacion impositiva o el regimen: hay que volver la orden a borrador.
 */
export async function assertWithholdingsStillValid(tx: Tx, companyId: string, supplier: LockedSupplier, orderId: string): Promise<void> {
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
