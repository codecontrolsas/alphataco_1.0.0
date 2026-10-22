'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { toDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { invoicedByOrderLine, supplierInvoiceLabel } from '../lib/invoices';
import { requestLineLabel } from '../lib/order-progress';
import { RECEIVING_ORDER_STATUSES } from '../lib/order-state-machine';
import { receivedByOrderLine } from '../lib/orders';
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
  const validSupplier = supplierId && isUuid(supplierId) ? supplierId : null;
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
              select: {
                description: true,
                material: { select: { code: true, name: true } },
                unit: { select: { abbreviation: true } },
              },
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
      where: {
        company_id: companyId,
        supplier_id: supplier.id,
        status: { not: 'CANCELLED' },
        cbte_type: { in: [1, 6, 11] },
      },
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

/** Valores del formulario para editar un comprobante vigente. */
export async function getSupplierInvoiceEditValues(id: string): Promise<SupplierInvoiceFormValues | null> {
  if (!isUuid(id)) return null;
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
    issueDate: toDateOnly(invoice.issue_date)!,
    dueDate: toDateOnly(invoice.due_date) ?? '',
    vatPeriod: invoice.vat_period,
    cae: invoice.cae ?? '',
    caeDueDate: toDateOnly(invoice.cae_due_date) ?? '',
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
