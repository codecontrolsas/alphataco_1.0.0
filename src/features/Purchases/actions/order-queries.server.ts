'use server';

import { checkPermissionServer } from '@/features/Permissions';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { UUID_RE } from '../lib/action-errors';
import { getOrderInvoicesSummary } from '../lib/invoices';
import {
  findOrderableRequestLines,
  orderedByLine,
  remainingOf,
  requestLineLabel,
} from '../lib/order-progress';
import { canApplyPurchaseOrderAction, type PurchaseOrderStatus } from '../lib/order-state-machine';
import { expiredSupplierDocuments, receivedByOrderLine } from '../lib/orders';
import { supplierRecipients } from '../lib/supplier-send';
import { type PurchaseOrderFormValues } from '../schemas/orders';

async function canPickRequestLines(): Promise<boolean> {
  const allowed = await Promise.all([
    checkPermissionServer('compras', 'ordenes', 'create'),
    checkPermissionServer('compras', 'cotizaciones', 'create'),
  ]);
  return allowed.some(Boolean);
}

/** Lineas de solicitud con faltante, para los selectores de la OC y del pedido de cotizacion. */
export async function searchOrderableRequestLines(query: string, options: { requestId?: string } = {}) {
  if (!(await canPickRequestLines())) return { items: [], total: 0 };
  if (options.requestId && !UUID_RE.test(options.requestId)) return { items: [], total: 0 };
  const companyId = await getActiveCompanyId();
  return findOrderableRequestLines(prisma, companyId, { term: query, requestId: options.requestId });
}

/** Proveedor (contactos, plazo, documentos vencidos) para el formulario y los dialogos. */
export async function getSupplierPurchaseContext(supplierId: string) {
  if (!UUID_RE.test(supplierId)) return null;
  const allowed = await Promise.all([
    checkPermissionServer('compras', 'ordenes', 'view'),
    checkPermissionServer('compras', 'cotizaciones', 'view'),
  ]);
  if (!allowed.some(Boolean)) return null;
  const companyId = await getActiveCompanyId();
  const supplier = await prisma.suppliers.findFirst({
    where: { id: supplierId, company_id: companyId },
    select: { id: true, name: true, payment_term_days: true, is_active: true },
  });
  if (!supplier) return null;
  const [expiredDocuments, recipients] = await Promise.all([
    expiredSupplierDocuments(prisma, supplier.id),
    supplierRecipients(prisma, supplier.id),
  ]);
  return {
    id: supplier.id,
    name: supplier.name,
    isActive: supplier.is_active,
    paymentTermDays: supplier.payment_term_days,
    expiredDocuments,
    recipients,
  };
}

const userName = (p: { fullname: string | null; email: string | null } | null) =>
  p ? p.fullname ?? p.email ?? 'Usuario' : null;

/** Detalle de la OC: cabecera, lineas con su solicitud de origen, historial y que se puede hacer. */
export async function getPurchaseOrderDetail(id: string) {
  if (!UUID_RE.test(id)) return null;
  const [canView, canUpdate, canApprove, canReceive] = await Promise.all([
    checkPermissionServer('compras', 'ordenes', 'view'),
    checkPermissionServer('compras', 'ordenes', 'update'),
    checkPermissionServer('compras', 'ordenes', 'approve'),
    checkPermissionServer('compras', 'recepciones', 'create'),
  ]);
  if (!canView) return null;
  const companyId = await getActiveCompanyId();

  const order = await prisma.purchase_orders.findFirst({
    where: { id, company_id: companyId },
    select: {
      id: true,
      number: true,
      status: true,
      supplier_id: true,
      delivery_date: true,
      delivery_place: true,
      payment_term_days: true,
      notes: true,
      subtotal: true,
      vat_total: true,
      total: true,
      created_at: true,
      submitted_at: true,
      approved_at: true,
      rejection_notes: true,
      sent_at: true,
      sent_to: true,
      cancelled_at: true,
      cancel_reason: true,
      closed_at: true,
      close_reason: true,
      closer: { select: { fullname: true, email: true } },
      complements: { select: { id: true, number: true } },
      complements_receipt: { select: { id: true, number: true } },
      complemented_by: { select: { id: true, number: true, status: true }, orderBy: { created_at: 'asc' } },
      receipts: {
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          number: true,
          received_on: true,
          delivery_note: true,
          created_at: true,
          cancelled_at: true,
          creator: { select: { fullname: true, email: true } },
        },
      },
      supplier: { select: { id: true, name: true, cuit: true } },
      quote: { select: { id: true, number: true } },
      creator: { select: { fullname: true, email: true } },
      approver: { select: { fullname: true, email: true } },
      sender: { select: { fullname: true, email: true } },
      canceller: { select: { fullname: true, email: true } },
      rejections: {
        orderBy: { rejected_at: 'asc' },
        select: { rejected_at: true, reason: true, rejecter: { select: { fullname: true, email: true } } },
      },
      lines: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          request_line_id: true,
          quote_line_id: true,
          quantity: true,
          unit_price: true,
          vat_rate_id: true,
          net_total: true,
          vat_amount: true,
          request_line: {
            select: {
              position: true,
              quantity: true,
              description: true,
              material: { select: { code: true, name: true } },
              unit: { select: { abbreviation: true } },
              request: { select: { id: true, number: true } },
            },
          },
        },
      },
    },
  });
  if (!order) return null;

  const status = order.status as PurchaseOrderStatus;
  const requestLineIds = order.lines.map((line) => line.request_line_id);
  const [orderedOthers, expiredDocuments, recipients, received, invoicing, canViewInvoices] = await Promise.all([
    orderedByLine(prisma, requestLineIds, { excludeOrderId: order.id }),
    expiredSupplierDocuments(prisma, order.supplier_id),
    supplierRecipients(prisma, order.supplier_id),
    receivedByOrderLine(
      prisma,
      order.lines.map((line) => line.id)
    ),
    getOrderInvoicesSummary(
      prisma,
      companyId,
      order.id,
      order.lines.map((line) => line.id)
    ),
    checkPermissionServer('compras', 'facturas', 'view'),
  ]);
  const at = (d: Date | null) => d?.toISOString() ?? null;

  const lines = order.lines.map((line) => {
    const requested = line.request_line.quantity.toString();
    // Faltante SIN contar esta OC: lo que se puede pedir en ella al editarla.
    const available = remainingOf(requested, orderedOthers.get(line.request_line_id) ?? '0');
    return {
      id: line.id,
      requestLineId: line.request_line_id,
      quoteLineId: line.quote_line_id,
      request: line.request_line.request,
      requestPosition: line.request_line.position,
      itemLabel: requestLineLabel({
        ...line.request_line,
        code: line.request_line.material?.code ?? null,
        name: line.request_line.material?.name ?? null,
      }),
      unitAbbr: line.request_line.unit.abbreviation,
      requested,
      available,
      quantity: line.quantity.toString(),
      unitPrice: line.unit_price.toString(),
      vatRateId: line.vat_rate_id,
      netTotal: line.net_total.toFixed(2),
      vatAmount: line.vat_amount.toFixed(2),
      received: received.get(line.id) ?? '0',
      pendingReceipt: remainingOf(line.quantity.toString(), received.get(line.id) ?? '0'),
      /** Facturado neto (facturas y ND menos NC, sin anulados ni rechazados). */
      invoiced: invoicing.invoiced.get(line.id) ?? '0',
    };
  });

  return {
    id: order.id,
    number: order.number,
    status,
    supplier: { id: order.supplier.id, name: order.supplier.name, cuit: order.supplier.cuit.toString() },
    quote: order.quote,
    deliveryDate: order.delivery_date ? order.delivery_date.toISOString().slice(0, 10) : null,
    deliveryPlace: order.delivery_place,
    paymentTermDays: order.payment_term_days,
    notes: order.notes,
    totals: {
      subtotal: order.subtotal.toFixed(2),
      vatTotal: order.vat_total.toFixed(2),
      total: order.total.toFixed(2),
    },
    creator: userName(order.creator),
    rejectionNotes: status === 'DRAFT' ? order.rejection_notes : null,
    sentTo: order.sent_to,
    closeReason: order.close_reason,
    complements: order.complements ? { ...order.complements, receipt: order.complements_receipt } : null,
    complementedBy: order.complemented_by,
    receipts: order.receipts.map((receipt) => ({
      id: receipt.id,
      number: receipt.number,
      receivedOn: receipt.received_on.toISOString().slice(0, 10),
      deliveryNote: receipt.delivery_note,
      cancelled: receipt.cancelled_at !== null,
    })),
    // Los comprobantes traen importes: solo para quien puede ver facturas.
    invoices: canViewInvoices ? invoicing.invoices : [],
    lines,
    expiredDocuments,
    recipients,
    form: {
      supplierId: order.supplier_id,
      deliveryDate: order.delivery_date ? order.delivery_date.toISOString().slice(0, 10) : '',
      deliveryPlace: order.delivery_place ?? '',
      paymentTermDays: order.payment_term_days === null ? '' : String(order.payment_term_days),
      notes: order.notes ?? '',
      lines: lines.map((line) => ({
        requestLineId: line.requestLineId,
        quoteLineId: line.quoteLineId ?? '',
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        vatRateId: line.vatRateId,
      })),
    } satisfies PurchaseOrderFormValues,
    lineOptions: lines.map((line) => ({
      requestLineId: line.requestLineId,
      requestId: line.request.id,
      requestNumber: line.request.number,
      position: line.requestPosition,
      itemLabel: line.itemLabel,
      unitAbbr: line.unitAbbr,
      requested: line.requested,
      remaining: line.available,
      suggestedSupplierId: null,
    })),
    history: [
      { event: 'Creada', at: at(order.created_at), by: userName(order.creator), notes: null },
      ...(order.submitted_at
        ? [{ event: 'Enviada a aprobación', at: at(order.submitted_at), by: null, notes: null }]
        : []),
      ...order.rejections.map((rejection) => ({
        event: 'Rechazada',
        at: at(rejection.rejected_at),
        by: userName(rejection.rejecter),
        notes: rejection.reason,
      })),
      ...(order.approved_at
        ? [{ event: 'Aprobada', at: at(order.approved_at), by: userName(order.approver), notes: null }]
        : []),
      ...(order.sent_at
        ? [
            {
              event: order.sent_to.length > 0 ? `Enviada a ${order.sent_to.join(', ')}` : 'Marcada como enviada',
              at: at(order.sent_at),
              by: userName(order.sender),
              notes: null,
            },
          ]
        : []),
      ...order.receipts.map((receipt) => ({
        event: `Recepción ${receipt.number}${receipt.cancelled_at ? ' (anulada)' : ''}`,
        at: at(receipt.created_at),
        by: userName(receipt.creator),
        notes: null,
      })),
      ...(order.closed_at
        ? [{ event: 'Cerrada', at: at(order.closed_at), by: userName(order.closer), notes: order.close_reason }]
        : []),
      ...(order.cancelled_at
        ? [{ event: 'Anulada', at: at(order.cancelled_at), by: userName(order.canceller), notes: order.cancel_reason }]
        : []),
    ].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '')),
    can: {
      edit: canApplyPurchaseOrderAction(status, 'edit') && canUpdate,
      submit: canApplyPurchaseOrderAction(status, 'submit') && canUpdate,
      approve: canApplyPurchaseOrderAction(status, 'approve') && canApprove,
      send: canApplyPurchaseOrderAction(status, 'send') && canUpdate,
      cancel:
        canApplyPurchaseOrderAction(status, 'cancel') &&
        canUpdate &&
        order.receipts.every((receipt) => receipt.cancelled_at),
      receive: canApplyPurchaseOrderAction(status, 'receive') && canReceive,
      close: canApplyPurchaseOrderAction(status, 'close') && canUpdate,
    },
  };
}
