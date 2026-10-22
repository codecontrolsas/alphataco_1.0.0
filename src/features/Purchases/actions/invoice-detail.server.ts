'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { VAT_RATE_LABELS, isVatRateId } from '@/shared/lib/arca/catalogs';
import { toDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';
import { buildStorageFileUrl } from '@/shared/lib/storage-url';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { parseObservations } from '../lib/invoice-observations';
import type { SupplierInvoiceStatus } from '../lib/invoice-status';
import { supplierInvoiceLabel, voucherInfo } from '../lib/invoices';
import { requestLineLabel } from '../lib/order-progress';
import { invoicePending } from '../lib/payment-balances';
import { SUPPLIER_FILES_BUCKET } from '../lib/storage-files';
import { userName } from '../lib/user-name';

/** Detalle del comprobante: datos, lineas con su OC, IVA, tributos, observaciones e historial. */
export async function getSupplierInvoiceDetail(id: string) {
  if (!isUuid(id)) return null;
  const [canView, canUpdate, canApprove] = await Promise.all([
    checkPermissionServer('compras', 'facturas', 'view'),
    checkPermissionServer('compras', 'facturas', 'update'),
    checkPermissionServer('compras', 'facturas', 'approve'),
  ]);
  if (!canView) return null;
  const companyId = await getActiveCompanyId();
  const invoice = await prisma.supplier_invoices.findFirst({
    where: { id, company_id: companyId },
    select: {
      id: true,
      cbte_type: true,
      sales_point: true,
      number: true,
      issue_date: true,
      due_date: true,
      vat_period: true,
      cae: true,
      cae_due_date: true,
      net_taxed: true,
      net_untaxed: true,
      exempt: true,
      vat_total: true,
      vat_perceptions: true,
      gross_income_perceptions: true,
      other_taxes: true,
      total: true,
      status: true,
      observations: true,
      resolution_comment: true,
      resolved_at: true,
      cancel_reason: true,
      cancelled_at: true,
      arca_check_result: true,
      arca_checked_at: true,
      arca_check_detail: true,
      attachment_path: true,
      attachment_name: true,
      notes: true,
      created_at: true,
      updated_at: true,
      supplier: { select: { id: true, name: true, cuit: true, vat_condition_id: true } },
      related_invoice: { select: { id: true, cbte_type: true, sales_point: true, number: true, status: true } },
      related_notes: { select: { id: true, cbte_type: true, sales_point: true, number: true, status: true } },
      creator: { select: { fullname: true, email: true } },
      updater: { select: { fullname: true, email: true } },
      resolver: { select: { fullname: true, email: true } },
      canceller: { select: { fullname: true, email: true } },
      lines: {
        select: {
          id: true,
          position: true,
          quantity: true,
          unit_price: true,
          description: true,
          vat_rate_id: true,
          net_total: true,
          vat_amount: true,
          expense_category: { select: { id: true, name: true } },
          order_line: {
            select: {
              id: true,
              unit_price: true,
              vat_rate_id: true,
              order: { select: { id: true, number: true } },
              request_line: {
                select: {
                  description: true,
                  material: { select: { code: true, name: true } },
                  unit: { select: { abbreviation: true } },
                },
              },
            },
          },
        },
        orderBy: { position: 'asc' },
      },
      vat: { select: { vat_rate_id: true, base: true, amount: true }, orderBy: { vat_rate_id: 'asc' } },
      taxes: {
        select: { id: true, kind: true, description: true, amount: true, province: { select: { name: true } } },
      },
    },
  });
  if (!invoice) return null;
  const { letter, kind } = voucherInfo(invoice.cbte_type);
  const [pendingMap, paymentLines] = await Promise.all([
    invoicePending(prisma, [invoice.id]),
    prisma.payment_order_lines.findMany({
      where: { invoice_id: invoice.id, payment_order: { status: { not: 'CANCELLED' } } },
      select: { amount: true, payment_order: { select: { id: true, number: true, status: true, paid_on: true } } },
      orderBy: { payment_order: { number: 'asc' } },
    }),
  ]);
  const status = invoice.status as SupplierInvoiceStatus;
  const observations = parseObservations(invoice.observations);
  const at = (d: Date | null) => d?.toISOString() ?? null;
  const active = status !== 'CANCELLED';
  const voucher = (r: { id: string; cbte_type: number; sales_point: number; number: bigint; status: string }) => ({
    id: r.id,
    label: supplierInvoiceLabel(r),
    status: r.status as SupplierInvoiceStatus,
  });

  return {
    id: invoice.id,
    label: supplierInvoiceLabel(invoice),
    cbteType: invoice.cbte_type,
    letter,
    kind,
    status,
    supplier: { ...invoice.supplier, cuit: invoice.supplier.cuit.toString() },
    salesPoint: invoice.sales_point,
    number: invoice.number.toString(),
    issueDate: toDateOnly(invoice.issue_date)!,
    dueDate: toDateOnly(invoice.due_date),
    vatPeriod: invoice.vat_period,
    cae: invoice.cae,
    caeDueDate: toDateOnly(invoice.cae_due_date),
    amounts: {
      netTaxed: invoice.net_taxed.toString(),
      netUntaxed: invoice.net_untaxed.toString(),
      exempt: invoice.exempt.toString(),
      vatTotal: invoice.vat_total.toString(),
      vatPerceptions: invoice.vat_perceptions.toString(),
      grossIncomePerceptions: invoice.gross_income_perceptions.toString(),
      otherTaxes: invoice.other_taxes.toString(),
      total: invoice.total.toString(),
    },
    observations,
    resolution: invoice.resolved_at ? { comment: invoice.resolution_comment, at: at(invoice.resolved_at) } : null,
    cancelReason: invoice.cancel_reason,
    arcaCheck: invoice.arca_check_result
      ? { result: invoice.arca_check_result, at: at(invoice.arca_checked_at), detail: invoice.arca_check_detail }
      : null,
    relatedInvoice: invoice.related_invoice ? voucher(invoice.related_invoice) : null,
    relatedNotes: invoice.related_notes.map(voucher),
    attachment: invoice.attachment_path
      ? {
          name: invoice.attachment_name ?? 'comprobante',
          url: buildStorageFileUrl(SUPPLIER_FILES_BUCKET, invoice.attachment_path),
        }
      : null,
    notes: invoice.notes,
    lines: invoice.lines.map((line) => {
      const orderLine = line.order_line;
      const lineObservations = observations.filter((o) => o.lineId === String(line.position - 1));
      return {
        id: line.id,
        kind: orderLine ? ('order' as const) : ('expense' as const),
        order: orderLine?.order ?? null,
        itemLabel: orderLine
          ? requestLineLabel({
              code: orderLine.request_line.material?.code ?? null,
              name: orderLine.request_line.material?.name ?? null,
              description: orderLine.request_line.description,
            })
          : line.description ?? '',
        expenseCategory: line.expense_category,
        unitAbbr: orderLine?.request_line.unit.abbreviation ?? null,
        quantity: line.quantity?.toString() ?? null,
        unitPrice: line.unit_price?.toString() ?? null,
        orderUnitPrice: orderLine?.unit_price.toString() ?? null,
        vatRateLabel:
          line.vat_rate_id !== null && isVatRateId(line.vat_rate_id) ? VAT_RATE_LABELS[line.vat_rate_id] : null,
        netTotal: line.net_total.toString(),
        vatAmount: line.vat_amount.toString(),
        observationCodes: lineObservations.map((o) => o.code),
      };
    }),
    vat: invoice.vat.map((v) => ({
      vatRateId: v.vat_rate_id,
      label: isVatRateId(v.vat_rate_id) ? VAT_RATE_LABELS[v.vat_rate_id] : String(v.vat_rate_id),
      base: v.base.toString(),
      amount: v.amount.toString(),
    })),
    taxes: invoice.taxes.map((t) => ({
      id: t.id,
      kind: t.kind,
      province: t.province?.name ?? null,
      description: t.description,
      amount: t.amount.toString(),
    })),
    /** Etapa 5: lo pendiente de pago y las ordenes de pago (no anuladas) donde esta. */
    payment: {
      pending: pendingMap.get(invoice.id) ?? invoice.total.toString(),
      paid: paymentLines
        .filter((l) => l.payment_order.status === 'PAID')
        .reduce((acc, l) => acc.plus(l.amount), new Prisma.Decimal(0))
        .toFixed(2),
      orders: paymentLines.map((l) => ({
        id: l.payment_order.id,
        number: l.payment_order.number,
        status: l.payment_order.status,
        paidOn: l.payment_order.paid_on ? l.payment_order.paid_on.toISOString().slice(0, 10) : null,
        amount: l.amount.toFixed(2),
      })),
    },
    history: [
      { event: 'Cargada', at: at(invoice.created_at), by: userName(invoice.creator), notes: null },
      ...(invoice.updater
        ? [{ event: 'Editada', at: at(invoice.updated_at), by: userName(invoice.updater), notes: null }]
        : []),
      ...(invoice.resolved_at
        ? [
            {
              event: status === 'REJECTED' ? 'Rechazada' : 'Aprobada',
              at: at(invoice.resolved_at),
              by: userName(invoice.resolver),
              notes: invoice.resolution_comment,
            },
          ]
        : []),
      ...(invoice.cancelled_at
        ? [
            {
              event: 'Anulada',
              at: at(invoice.cancelled_at),
              by: userName(invoice.canceller),
              notes: invoice.cancel_reason,
            },
          ]
        : []),
    ],
    can: {
      edit: active && canUpdate,
      approve: status === 'OBSERVED' && canApprove,
      cancel: active && canUpdate,
      check: active && canUpdate && invoice.cae !== null,
    },
  };
}
