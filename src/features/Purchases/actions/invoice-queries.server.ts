'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { VAT_RATE_LABELS, isVatRateId } from '@/shared/lib/arca/catalogs';
import type { arca_check_result } from '@/generated/prisma/enums';
import { prisma } from '@/shared/lib/prisma';
import { buildStorageFileUrl } from '@/shared/lib/storage-url';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { UUID_RE } from '../lib/action-errors';
import { parseObservations } from '../lib/invoice-observations';
import type { SupplierInvoiceStatus } from '../lib/invoice-status';
import { invoicedByOrderLine, supplierInvoiceLabel, voucherInfo } from '../lib/invoices';
import { requestLineLabel } from '../lib/order-progress';
import { RECEIVING_ORDER_STATUSES } from '../lib/order-state-machine';
import { receivedByOrderLine } from '../lib/orders';
import { invoicePending } from '../lib/payment-balances';
import { SUPPLIER_FILES_BUCKET } from '../lib/storage-files';
import { type SupplierInvoiceFormValues } from '../schemas/invoices';

const ORDERS_WITH_RECEIPTS = [...RECEIVING_ORDER_STATUSES, 'CLOSED' as const];

/**
 * Datos del formulario: conceptos activos, provincias y, con un proveedor elegido (se busca con
 * `searchSupplierOptions`), su condicion de IVA, sus OC con lineas (recibido y facturado) y sus
 * facturas vigentes (para vincular una NC o ND).
 */
export async function getSupplierInvoiceFormData(supplierId?: string, options: { excludeInvoiceId?: string } = {}) {
  const [canCreate, canUpdate] = await Promise.all([
    checkPermissionServer('compras', 'facturas', 'create'),
    checkPermissionServer('compras', 'facturas', 'update'),
  ]);
  if (!canCreate && !canUpdate) return null;
  const companyId = await getActiveCompanyId();
  const validSupplier = supplierId && UUID_RE.test(supplierId) ? supplierId : null;
  const [supplier, categories, provinces, fiscal] = await Promise.all([
    validSupplier
      ? prisma.suppliers.findFirst({
          where: { id: validSupplier, company_id: companyId },
          select: { id: true, name: true, cuit: true, vat_condition_id: true },
        })
      : null,
    prisma.purchase_expense_categories.findMany({
      where: { company_id: companyId, is_active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.provinces.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.company_fiscal_profiles.findUnique({ where: { company_id: companyId }, select: { tax_condition: true } }),
  ]);

  let orders: {
    id: string;
    number: string;
    lines: {
      orderLineId: string;
      label: string;
      unitAbbr: string | null;
      unitPrice: string;
      vatRateId: number;
      received: string;
      invoiced: string;
    }[];
  }[] = [];
  let invoices: { id: string; label: string; issueDate: string; total: string }[] = [];

  if (supplier) {
    const rows = await prisma.purchase_orders.findMany({
      where: { company_id: companyId, supplier_id: supplier.id, status: { in: ORDERS_WITH_RECEIPTS } },
      select: {
        id: true,
        number: true,
        lines: {
          select: {
            id: true,
            unit_price: true,
            vat_rate_id: true,
            request_line: {
              select: { description: true, material: { select: { code: true, name: true } }, unit: { select: { abbreviation: true } } },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { number: 'desc' },
    });
    const lineIds = rows.flatMap((o) => o.lines.map((l) => l.id));
    const [received, invoiced] = await Promise.all([
      receivedByOrderLine(prisma, lineIds),
      invoicedByOrderLine(prisma, lineIds, { excludeInvoiceId: options.excludeInvoiceId }),
    ]);
    orders = rows.map((order) => ({
      id: order.id,
      number: order.number,
      lines: order.lines.map((line) => ({
        orderLineId: line.id,
        label: requestLineLabel({
          code: line.request_line.material?.code ?? null,
          name: line.request_line.material?.name ?? null,
          description: line.request_line.description,
        }),
        unitAbbr: line.request_line.unit.abbreviation,
        unitPrice: line.unit_price.toString(),
        vatRateId: line.vat_rate_id,
        received: received.get(line.id) ?? '0',
        invoiced: invoiced.get(line.id) ?? '0',
      })),
    }));
    const related = await prisma.supplier_invoices.findMany({
      where: { company_id: companyId, supplier_id: supplier.id, status: { not: 'CANCELLED' }, cbte_type: { in: [1, 6, 11] } },
      select: { id: true, cbte_type: true, sales_point: true, number: true, issue_date: true, total: true },
      orderBy: { issue_date: 'desc' },
      take: 200,
    });
    invoices = related.map((r) => ({
      id: r.id,
      label: supplierInvoiceLabel(r),
      issueDate: r.issue_date.toISOString().slice(0, 10),
      total: r.total.toString(),
    }));
  }

  return {
    companyTaxCondition: fiscal?.tax_condition ?? null,
    supplier: supplier ? { ...supplier, cuit: supplier.cuit.toString() } : null,
    categories,
    provinces: provinces.map((p) => ({ id: p.id.toString(), name: p.name })),
    orders,
    invoices,
  };
}

const userName = (p: { fullname: string | null; email: string | null } | null) => (p ? (p.fullname ?? p.email ?? 'Usuario') : null);
const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Detalle del comprobante: datos, lineas con su OC, IVA, tributos, observaciones e historial. */
export async function getSupplierInvoiceDetail(id: string) {
  if (!UUID_RE.test(id)) return null;
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
                select: { description: true, material: { select: { code: true, name: true } }, unit: { select: { abbreviation: true } } },
              },
            },
          },
        },
        orderBy: { position: 'asc' },
      },
      vat: { select: { vat_rate_id: true, base: true, amount: true }, orderBy: { vat_rate_id: 'asc' } },
      taxes: { select: { id: true, kind: true, description: true, amount: true, province: { select: { name: true } } } },
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
    issueDate: isoDay(invoice.issue_date)!,
    dueDate: isoDay(invoice.due_date),
    vatPeriod: invoice.vat_period,
    cae: invoice.cae,
    caeDueDate: isoDay(invoice.cae_due_date),
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
      ? { name: invoice.attachment_name ?? 'comprobante', url: buildStorageFileUrl(SUPPLIER_FILES_BUCKET, invoice.attachment_path) }
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
          : (line.description ?? ''),
        expenseCategory: line.expense_category,
        unitAbbr: orderLine?.request_line.unit.abbreviation ?? null,
        quantity: line.quantity?.toString() ?? null,
        unitPrice: line.unit_price?.toString() ?? null,
        orderUnitPrice: orderLine?.unit_price.toString() ?? null,
        vatRateLabel: line.vat_rate_id !== null && isVatRateId(line.vat_rate_id) ? VAT_RATE_LABELS[line.vat_rate_id] : null,
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
      ...(invoice.updater ? [{ event: 'Editada', at: at(invoice.updated_at), by: userName(invoice.updater), notes: null }] : []),
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
        ? [{ event: 'Anulada', at: at(invoice.cancelled_at), by: userName(invoice.canceller), notes: invoice.cancel_reason }]
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

/** Valores del formulario para editar un comprobante vigente. */
export async function getSupplierInvoiceEditValues(id: string): Promise<SupplierInvoiceFormValues | null> {
  if (!UUID_RE.test(id)) return null;
  if (!(await checkPermissionServer('compras', 'facturas', 'update'))) return null;
  const companyId = await getActiveCompanyId();
  const invoice = await prisma.supplier_invoices.findFirst({
    where: { id, company_id: companyId, status: { not: 'CANCELLED' } },
    select: {
      supplier_id: true,
      cbte_type: true,
      sales_point: true,
      number: true,
      issue_date: true,
      due_date: true,
      vat_period: true,
      cae: true,
      cae_due_date: true,
      related_invoice_id: true,
      notes: true,
      net_untaxed: true,
      exempt: true,
      lines: {
        select: {
          order_line_id: true,
          quantity: true,
          unit_price: true,
          expense_category_id: true,
          description: true,
          vat_rate_id: true,
          net_total: true,
        },
        orderBy: { position: 'asc' },
      },
      vat: { select: { vat_rate_id: true, amount: true }, orderBy: { vat_rate_id: 'asc' } },
      taxes: { select: { kind: true, province_id: true, description: true, amount: true } },
    },
  });
  if (!invoice) return null;
  const amount = (d: Prisma.Decimal) => (d.isZero() ? '' : d.toFixed(2));
  return {
    supplierId: invoice.supplier_id,
    cbteType: invoice.cbte_type,
    salesPoint: String(invoice.sales_point),
    number: invoice.number.toString(),
    issueDate: isoDay(invoice.issue_date)!,
    dueDate: isoDay(invoice.due_date) ?? '',
    vatPeriod: invoice.vat_period,
    cae: invoice.cae ?? '',
    caeDueDate: isoDay(invoice.cae_due_date) ?? '',
    relatedInvoiceId: invoice.related_invoice_id ?? '',
    notes: invoice.notes ?? '',
    lines: invoice.lines.map((line) => ({
      kind: line.order_line_id ? ('order' as const) : ('expense' as const),
      orderLineId: line.order_line_id ?? '',
      expenseCategoryId: line.expense_category_id ?? '',
      description: line.description ?? '',
      quantity: line.quantity ? line.quantity.toString() : '',
      unitPrice: line.unit_price ? line.unit_price.toString() : '',
      net: line.order_line_id ? '' : line.net_total.toFixed(2),
      vatRateId: line.vat_rate_id !== null ? String(line.vat_rate_id) : '',
    })),
    vat: invoice.vat.map((v) => ({ vatRateId: v.vat_rate_id, amount: v.amount.toFixed(2) })),
    untaxed: amount(invoice.net_untaxed),
    exempt: amount(invoice.exempt),
    taxes: invoice.taxes.map((t) => ({
      kind: t.kind,
      provinceId: t.province_id?.toString() ?? '',
      description: t.description ?? '',
      amount: t.amount.toFixed(2),
    })),
  };
}
