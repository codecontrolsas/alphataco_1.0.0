'use server';

import { argentinaDate } from '@/shared/lib/argentina-time';
import { checkPermissionServer } from '@/features/Permissions';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { prisma } from '@/shared/lib/prisma';
import { buildStorageFileUrl } from '@/shared/lib/storage-url';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { UUID_RE } from '../lib/action-errors';
import { requestLineLabel } from '../lib/order-progress';
import { comparePrices, computeOrderTotals } from '../lib/order-totals';
import { canApplyPurchaseQuoteAction, type PurchaseQuoteStatus } from '../lib/quote-state-machine';
import { ORDERABLE_REQUEST_STATUSES, type PurchaseRequestStatus } from '../lib/request-state-machine';
import { SUPPLIER_FILES_BUCKET } from '../lib/storage-files';
import { supplierRecipients } from '../lib/supplier-send';
import { type PurchaseQuoteFormValues } from '../schemas/quotes';

const userName = (p: { fullname: string | null; email: string | null } | null) =>
  p ? p.fullname ?? p.email ?? 'Usuario' : null;
const dateOnly = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

/** Detalle del pedido de cotizacion: lineas con su solicitud, respuesta, OC generadas e historial. */
export async function getPurchaseQuoteDetail(id: string) {
  if (!UUID_RE.test(id)) return null;
  const [canView, canUpdate, canCreateOrder] = await Promise.all([
    checkPermissionServer('compras', 'cotizaciones', 'view'),
    checkPermissionServer('compras', 'cotizaciones', 'update'),
    checkPermissionServer('compras', 'ordenes', 'create'),
  ]);
  if (!canView) return null;
  const companyId = await getActiveCompanyId();

  const quote = await prisma.purchase_quotes.findFirst({
    where: { id, company_id: companyId },
    select: {
      id: true,
      number: true,
      status: true,
      supplier_id: true,
      notes: true,
      sent_at: true,
      sent_to: true,
      received_at: true,
      valid_until: true,
      delivery_days: true,
      supplier_notes: true,
      attachment_path: true,
      attachment_name: true,
      created_at: true,
      cancelled_at: true,
      cancel_reason: true,
      supplier: { select: { id: true, name: true } },
      creator: { select: { fullname: true, email: true } },
      canceller: { select: { fullname: true, email: true } },
      orders: { select: { id: true, number: true, status: true }, orderBy: { created_at: 'asc' } },
      lines: {
        select: {
          id: true,
          request_line_id: true,
          quantity: true,
          unit_price: true,
          vat_rate_id: true,
          not_quoted: true,
          request_line: {
            select: {
              position: true,
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
  if (!quote) return null;

  const status = quote.status as PurchaseQuoteStatus;
  const lines = quote.lines
    .map((line) => ({
      id: line.id,
      requestLineId: line.request_line_id,
      request: line.request_line.request,
      requestPosition: line.request_line.position,
      itemLabel: requestLineLabel({
        code: line.request_line.material?.code ?? null,
        name: line.request_line.material?.name ?? null,
        description: line.request_line.description,
      }),
      unitAbbr: line.request_line.unit.abbreviation,
      quantity: line.quantity.toString(),
      unitPrice: line.unit_price?.toString() ?? null,
      vatRateId: line.vat_rate_id,
      notQuoted: line.not_quoted,
    }))
    .sort((a, b) => a.request.number.localeCompare(b.request.number) || a.requestPosition - b.requestPosition);
  const priced = lines.flatMap((line) =>
    line.unitPrice !== null && line.vatRateId !== null
      ? [{ quantity: line.quantity, unitPrice: line.unitPrice, vatRateId: line.vatRateId }]
      : []
  );
  const hasOrders = quote.orders.some((order) => order.status !== 'CANCELLED');
  const recipients = await supplierRecipients(prisma, quote.supplier_id);
  const at = (d: Date | null) => d?.toISOString() ?? null;

  return {
    id: quote.id,
    number: quote.number,
    status,
    supplier: quote.supplier,
    notes: quote.notes,
    sentTo: quote.sent_to,
    receivedAt: dateOnly(quote.received_at),
    validUntil: dateOnly(quote.valid_until),
    deliveryDays: quote.delivery_days,
    supplierNotes: quote.supplier_notes,
    attachment: quote.attachment_path
      ? {
          name: quote.attachment_name ?? 'presupuesto',
          url: buildStorageFileUrl(SUPPLIER_FILES_BUCKET, quote.attachment_path),
        }
      : null,
    totals: priced.length > 0 ? computeOrderTotals(priced) : null,
    lines,
    orders: quote.orders,
    recipients,
    requests: [...new Map(lines.map((line) => [line.request.id, line.request])).values()],
    history: [
      { event: 'Creada', at: at(quote.created_at), by: userName(quote.creator), notes: null },
      ...(quote.sent_at
        ? [
            {
              event: quote.sent_to.length > 0 ? `Enviada a ${quote.sent_to.join(', ')}` : 'Marcada como enviada',
              at: at(quote.sent_at),
              by: null,
              notes: null,
            },
          ]
        : []),
      ...(quote.received_at
        ? [
            {
              event: status === 'DECLINED' ? 'No cotiza' : 'Respondida',
              at: dateOnly(quote.received_at),
              by: null,
              notes: quote.supplier_notes,
            },
          ]
        : []),
      ...(quote.cancelled_at
        ? [{ event: 'Anulada', at: at(quote.cancelled_at), by: userName(quote.canceller), notes: quote.cancel_reason }]
        : []),
    ],
    form: {
      supplierId: quote.supplier_id,
      requestLineIds: lines.map((line) => line.requestLineId),
      notes: quote.notes ?? '',
    } satisfies PurchaseQuoteFormValues,
    can: {
      edit: canApplyPurchaseQuoteAction(status, 'edit') && canUpdate,
      send: canApplyPurchaseQuoteAction(status, 'send') && canUpdate,
      receive: canApplyPurchaseQuoteAction(status, 'receive') && canUpdate && !hasOrders,
      decline: canApplyPurchaseQuoteAction(status, 'decline') && canUpdate,
      cancel: canApplyPurchaseQuoteAction(status, 'cancel') && canUpdate,
      attach: status !== 'CANCELLED' && canUpdate,
      order: canApplyPurchaseQuoteAction(status, 'order') && canCreateOrder,
    },
  };
}

type ComparisonCell =
  | { state: 'price'; unitPrice: string; vatRateId: number }
  | { state: 'not_quoted' }
  | { state: 'pending' };

/**
 * Comparativo de las cotizaciones de una solicitud: una columna por pedido no anulado, una fila
 * por linea, y el menor unitario neto por linea marcado (en un empate, todos).
 */
export async function getRequestQuoteComparison(requestId: string) {
  if (!UUID_RE.test(requestId)) return null;
  const [canViewQuotes, canViewRequests, canViewAll, canCreateOrder, profile] = await Promise.all([
    checkPermissionServer('compras', 'cotizaciones', 'view'),
    checkPermissionServer('compras', 'solicitudes', 'view'),
    checkPermissionServer('compras', 'solicitudes', 'view_all_requests'),
    checkPermissionServer('compras', 'ordenes', 'create'),
    getServerAuthProfile(),
  ]);
  if (!canViewQuotes || !canViewRequests || !profile) return null;
  const companyId = await getActiveCompanyId();

  const request = await prisma.purchase_requests.findFirst({
    where: { id: requestId, company_id: companyId, ...(canViewAll ? {} : { requested_by: profile.id }) },
    select: {
      status: true,
      lines: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          position: true,
          quantity: true,
          description: true,
          material: { select: { code: true, name: true } },
          unit: { select: { abbreviation: true } },
        },
      },
    },
  });
  if (!request) return null;

  const quotes = await prisma.purchase_quotes.findMany({
    where: {
      company_id: companyId,
      status: { not: 'CANCELLED' },
      lines: { some: { request_line: { request_id: requestId } } },
    },
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      number: true,
      status: true,
      valid_until: true,
      delivery_days: true,
      supplier: { select: { name: true } },
      lines: {
        where: { request_line: { request_id: requestId } },
        select: { request_line_id: true, quantity: true, unit_price: true, vat_rate_id: true, not_quoted: true },
      },
    },
  });

  const orderable: readonly PurchaseRequestStatus[] = ORDERABLE_REQUEST_STATUSES;
  const requestOrderable = orderable.includes(request.status as PurchaseRequestStatus);
  const today = argentinaDate();

  const columns = quotes.map((quote) => {
    const priced = quote.lines.flatMap((line) =>
      line.unit_price !== null && line.vat_rate_id !== null
        ? [{ quantity: line.quantity.toString(), unitPrice: line.unit_price.toString(), vatRateId: line.vat_rate_id }]
        : []
    );
    const validUntil = dateOnly(quote.valid_until);
    return {
      quoteId: quote.id,
      number: quote.number,
      supplierName: quote.supplier.name,
      status: quote.status as PurchaseQuoteStatus,
      deliveryDays: quote.delivery_days,
      validUntil,
      expired: validUntil !== null && validUntil < today,
      total: priced.length > 0 ? computeOrderTotals(priced).total : null,
      canOrder: quote.status === 'RECEIVED' && canCreateOrder && requestOrderable,
    };
  });

  const rows = request.lines.map((line) => {
    const cells: Record<string, ComparisonCell> = {};
    for (const quote of quotes) {
      const quoteLine = quote.lines.find((candidate) => candidate.request_line_id === line.id);
      if (!quoteLine) continue;
      if (quoteLine.not_quoted) cells[quote.id] = { state: 'not_quoted' };
      else if (quoteLine.unit_price !== null && quoteLine.vat_rate_id !== null) {
        cells[quote.id] = {
          state: 'price',
          unitPrice: quoteLine.unit_price.toString(),
          vatRateId: quoteLine.vat_rate_id,
        };
      } else cells[quote.id] = { state: 'pending' };
    }
    const prices = Object.entries(cells).flatMap(([quoteId, cell]) =>
      cell.state === 'price' ? [{ quoteId, price: cell.unitPrice }] : []
    );
    const min = prices.reduce<string | null>(
      (acc, entry) => (acc === null || comparePrices(entry.price, acc) < 0 ? entry.price : acc),
      null
    );
    return {
      lineId: line.id,
      position: line.position,
      itemLabel: requestLineLabel({
        code: line.material?.code ?? null,
        name: line.material?.name ?? null,
        description: line.description,
      }),
      quantity: line.quantity.toString(),
      unitAbbr: line.unit.abbreviation,
      cells,
      bestQuoteIds:
        min === null
          ? []
          : prices.filter((entry) => comparePrices(entry.price, min) === 0).map((entry) => entry.quoteId),
    };
  });

  return { columns, rows };
}
