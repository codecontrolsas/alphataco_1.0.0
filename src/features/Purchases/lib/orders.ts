import 'server-only';
import { argentinaDate } from '@/shared/lib/argentina-time';

import { AMOUNT_SCALE, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { Prisma } from '@/generated/prisma/client';
import moment from 'moment';
import type { PurchaseOrderInput } from '../schemas/orders';
import {
  PURCHASE_ORDER_STATUS_PAST,
  RECEIVING_ORDER_STATUSES,
  canApplyPurchaseOrderAction,
  receiptStatus,
  type PurchaseOrderAction,
  type PurchaseOrderStatus,
} from './order-state-machine';
import { comparePrices, computeOrderLine, computeOrderTotals, type OrderTotals } from './order-totals';
import { formatQuantityWithUnit } from './quantity-format';
import { assertWithinRemaining, lockRequestsForLines, orderedByLine, type LockedRequestLine } from './order-progress';

/** `net_total`, `subtotal` y `total` son DECIMAL(15,2): el maximo es menor a 10^13 (escalado: 10^15). */
const MAX_AMOUNT_SCALED = BigInt(10) ** BigInt(15);
const tooBig = (amount: string) => (parseScaled(amount, AMOUNT_SCALE) ?? BigInt(0)) >= MAX_AMOUNT_SCALED;
import { PurchaseError } from './purchase-errors';
import { ORDERABLE_REQUEST_STATUSES, PURCHASE_REQUEST_STATUS_LABELS, type PurchaseRequestStatus } from './request-state-machine';

type Tx = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | '$executeRaw' | 'suppliers' | 'purchase_quote_lines' | 'purchase_order_lines' | 'supplier_documents'
>;

export interface LockedPurchaseOrder {
  id: string;
  number: string;
  status: PurchaseOrderStatus;
  createdBy: string;
  supplierId: string;
}

/** Lockea la OC (`FOR UPDATE`) y valida que admita la accion: "La orden OC-000007 ya fue aprobada". */
export async function lockPurchaseOrder(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  companyId: string,
  orderId: string,
  action: PurchaseOrderAction
): Promise<LockedPurchaseOrder> {
  const rows = await tx.$queryRaw<{ id: string; number: string; status: PurchaseOrderStatus; created_by: string; supplier_id: string }[]>`
    SELECT id, number, status::text AS status, created_by, supplier_id
    FROM purchase_orders
    WHERE id = ${orderId}::uuid AND company_id = ${companyId}::uuid
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new PurchaseError('La orden de compra no existe');
  if (!canApplyPurchaseOrderAction(row.status, action)) {
    throw new PurchaseError(`La orden ${row.number} ya fue ${PURCHASE_ORDER_STATUS_PAST[row.status]}`);
  }
  return { id: row.id, number: row.number, status: row.status, createdBy: row.created_by, supplierId: row.supplier_id };
}

export interface ValidatedOrderLine {
  request_line_id: string;
  quote_line_id: string | null;
  quantity: Prisma.Decimal;
  unit_price: Prisma.Decimal;
  vat_rate_id: number;
  net_total: Prisma.Decimal;
  vat_amount: Prisma.Decimal;
}

export interface ValidatedOrder {
  supplier: { id: string; name: string; paymentTermDays: number | null };
  lines: ValidatedOrderLine[];
  totals: OrderTotals;
  /** Solicitudes de las lineas, para recalcular su avance. */
  requestIds: string[];
}

/**
 * Valida una OC contra la empresa y contra lo que falta de cada linea de solicitud. Lockea las
 * solicitudes involucradas: llamarla SIEMPRE dentro de la transaccion que escribe la OC.
 *
 * Una linea tiene que ser de una solicitud APROBADA o PEDIDA EN PARTE. Al editar o enviar un
 * borrador, las lineas que ya estaban en esa OC tambien valen aunque la solicitud haya quedado
 * PEDIDA (justamente por este borrador) o CERRADA, y lo que ya pedia esta OC no cuenta como pedido.
 */
export async function validatePurchaseOrderInput(
  tx: Tx,
  companyId: string,
  input: PurchaseOrderInput,
  options: { orderId?: string; complement?: boolean } = {}
): Promise<ValidatedOrder> {
  if (input.lines.length === 0) throw new PurchaseError('Agregá al menos una línea');

  const supplier = await tx.suppliers.findFirst({
    where: { id: input.supplierId, company_id: companyId },
    select: { id: true, name: true, is_active: true, payment_term_days: true },
  });
  if (!supplier) throw new PurchaseError('El proveedor no existe');
  if (!supplier.is_active) throw new PurchaseError(`El proveedor ${supplier.name} está inactivo`);

  const locked = await lockRequestsForLines(
    tx,
    companyId,
    input.lines.map((line) => line.requestLineId)
  );

  // Lo que este borrador ya tenia por linea de solicitud (al editar o enviar a aprobacion).
  const alreadyInOrder = new Map<string, Prisma.Decimal>();
  if (options.orderId) {
    const current = await tx.purchase_order_lines.findMany({
      where: { order_id: options.orderId },
      select: { request_line_id: true, quantity: true },
    });
    for (const line of current) {
      alreadyInOrder.set(line.request_line_id, (alreadyInOrder.get(line.request_line_id) ?? new Prisma.Decimal(0)).plus(line.quantity));
    }
  }

  // Una OC complementaria regulariza un excedente que YA llego: sus lineas no pasan por el estado
  // de la solicitud ni por "no pedir de mas" (spec etapa 3 §3).
  const complement = options.complement === true;
  const orderable: readonly PurchaseRequestStatus[] = ORDERABLE_REQUEST_STATUSES;
  for (const line of complement ? [] : locked.values()) {
    // Lo ya pedido en OC "sigue su curso" aunque la solicitud se haya completado o cerrado.
    const keepsOwnLine =
      alreadyInOrder.has(line.requestLineId) && (line.requestStatus === 'ORDERED' || line.requestStatus === 'CLOSED');
    if (!orderable.includes(line.requestStatus) && !keepsOwnLine) {
      throw new PurchaseError(
        `La solicitud ${line.requestNumber} está ${PURCHASE_REQUEST_STATUS_LABELS[line.requestStatus].toLowerCase()}: sus líneas no se pueden pedir`
      );
    }
  }

  // Una solicitud CERRADA no compra lo que falta: su borrador puede bajar, no subir.
  const asked = new Map<string, Prisma.Decimal>();
  for (const line of input.lines) {
    asked.set(line.requestLineId, (asked.get(line.requestLineId) ?? new Prisma.Decimal(0)).plus(line.quantity));
  }
  for (const [requestLineId, quantity] of asked) {
    const line = locked.get(requestLineId)!;
    if (complement || line.requestStatus !== 'CLOSED') continue;
    const before = alreadyInOrder.get(requestLineId) ?? new Prisma.Decimal(0);
    if (quantity.gt(before)) {
      throw new PurchaseError(
        `La solicitud ${line.requestNumber} está cerrada: de la línea ${line.position} no se puede pedir más de ${formatQuantityWithUnit(before.toString(), line.unitAbbr)}`
      );
    }
  }

  const quoteLinks = await quoteLinksFor(tx, companyId, supplier.id, input, locked);

  const ordered = await orderedByLine(
    tx,
    input.lines.map((line) => line.requestLineId),
    { excludeOrderId: options.orderId }
  );
  if (!complement) assertWithinRemaining(input.lines, locked, ordered);

  const lines = input.lines.map((line, i): ValidatedOrderLine => {
    const amounts = computeOrderLine(line);
    if (!amounts) throw new PurchaseError(`Línea ${i + 1}: revisá la cantidad, el precio y la alícuota`);
    if (tooBig(amounts.netTotal)) throw new PurchaseError(`El importe de la línea ${i + 1} supera el máximo permitido`);
    return {
      request_line_id: line.requestLineId,
      quote_line_id: quoteLinks.get(i) ?? null,
      quantity: new Prisma.Decimal(line.quantity),
      unit_price: new Prisma.Decimal(line.unitPrice),
      vat_rate_id: line.vatRateId,
      net_total: new Prisma.Decimal(amounts.netTotal),
      vat_amount: new Prisma.Decimal(amounts.vatAmount),
    };
  });

  const totals = computeOrderTotals(input.lines);
  if (tooBig(totals.total)) throw new PurchaseError('El total de la orden supera el máximo permitido: dividila en varias órdenes');

  return {
    supplier: { id: supplier.id, name: supplier.name, paymentTermDays: supplier.payment_term_days },
    lines,
    totals,
    requestIds: [...new Set([...locked.values()].map((line) => line.requestId))],
  };
}

/**
 * Vinculo de cada linea con la cotizacion de la que salio su precio (indice de linea -> id de linea
 * de cotizacion). Tiene que ser una cotizacion respondida del mismo proveedor y la misma linea de
 * solicitud. Si el comprador cambio el precio o la alicuota, la linea deja de figurar como "de la
 * cotizacion": el respaldo no puede decir PC-X con un precio que PC-X no ofrecio.
 */
async function quoteLinksFor(
  tx: Tx,
  companyId: string,
  supplierId: string,
  input: PurchaseOrderInput,
  locked: Map<string, LockedRequestLine>
): Promise<Map<number, string>> {
  const links = new Map<number, string>();
  const quoteLineIds = [...new Set(input.lines.flatMap((line) => (line.quoteLineId ? [line.quoteLineId] : [])))];
  if (quoteLineIds.length === 0) return links;
  const quoteLines = await tx.purchase_quote_lines.findMany({
    where: { id: { in: quoteLineIds }, quote: { company_id: companyId } },
    select: {
      id: true,
      request_line_id: true,
      not_quoted: true,
      unit_price: true,
      vat_rate_id: true,
      quote: { select: { supplier_id: true, status: true, number: true } },
    },
  });
  const byId = new Map(quoteLines.map((line) => [line.id, line]));
  for (const [i, line] of input.lines.entries()) {
    if (!line.quoteLineId) continue;
    const quoteLine = byId.get(line.quoteLineId);
    if (!quoteLine || quoteLine.request_line_id !== line.requestLineId || !locked.has(line.requestLineId)) {
      throw new PurchaseError('Una de las líneas no corresponde a la cotización');
    }
    if (quoteLine.quote.supplier_id !== supplierId) {
      throw new PurchaseError(`La cotización ${quoteLine.quote.number} es de otro proveedor`);
    }
    if (quoteLine.quote.status !== 'RECEIVED' || quoteLine.not_quoted || quoteLine.unit_price === null) {
      throw new PurchaseError(`La cotización ${quoteLine.quote.number} no tiene precio para esa línea`);
    }
    const samePrice = comparePrices(quoteLine.unit_price.toString(), line.unitPrice) === 0 && quoteLine.vat_rate_id === line.vatRateId;
    if (samePrice) links.set(i, quoteLine.id);
  }
  return links;
}

export interface ExpiredSupplierDocument {
  id: string;
  name: string;
  expiresAt: string;
}

/** Documentos vigentes (no reemplazados) del proveedor vencidos al dia de hoy. Avisan, no bloquean. */
export async function expiredSupplierDocuments(
  tx: Pick<Prisma.TransactionClient, 'supplier_documents'>,
  supplierId: string
): Promise<ExpiredSupplierDocument[]> {
  const today = new Date(`${argentinaDate()}T00:00:00.000Z`);
  const documents = await tx.supplier_documents.findMany({
    where: { supplier_id: supplierId, replaced_by_id: null, expires_at: { lt: today } },
    select: { id: true, name: true, expires_at: true },
    orderBy: { expires_at: 'asc' },
  });
  return documents.map((doc) => ({ id: doc.id, name: doc.name, expiresAt: moment.utc(doc.expires_at).format('YYYY-MM-DD') }));
}

/** Recibido por linea de OC en recepciones vigentes (texto decimal; '0' si no hay). */
export async function receivedByOrderLine(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  orderLineIds: readonly string[]
): Promise<Map<string, string>> {
  const ids = [...new Set(orderLineIds)];
  const result = new Map(ids.map((id) => [id, '0']));
  if (ids.length === 0) return result;
  const rows = await tx.$queryRaw<{ order_line_id: string; received: string }[]>`
    SELECT rl.order_line_id, SUM(rl.quantity)::text AS received
    FROM purchase_receipt_lines rl
    JOIN purchase_receipts r ON r.id = rl.receipt_id
    WHERE rl.order_line_id = ANY(${ids}::uuid[]) AND r.cancelled_at IS NULL
    GROUP BY rl.order_line_id
  `;
  for (const row of rows) result.set(row.order_line_id, row.received);
  return result;
}

/**
 * Recalcula SENT / PARTIALLY_RECEIVED / RECEIVED de la OC con lo recibido. En cualquier otro
 * estado (borrador, aprobada, cerrada, anulada) no toca nada. Solo escribe si cambia.
 */
export async function recomputeOrderReceiptStatus(
  tx: Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw' | 'purchase_orders' | 'purchase_order_lines'>,
  orderId: string
): Promise<PurchaseOrderStatus> {
  const order = await tx.purchase_orders.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  const status = order.status as PurchaseOrderStatus;
  const receiving: readonly PurchaseOrderStatus[] = RECEIVING_ORDER_STATUSES;
  if (!receiving.includes(status)) return status;
  const lines = await tx.purchase_order_lines.findMany({ where: { order_id: orderId }, select: { id: true, quantity: true } });
  const received = await receivedByOrderLine(
    tx,
    lines.map((line) => line.id)
  );
  const next = receiptStatus(lines.map((line) => ({ ordered: line.quantity.toString(), received: received.get(line.id) ?? '0' })));
  if (next !== status) {
    await tx.$executeRaw`
      UPDATE purchase_orders SET status = ${next}::purchase_order_status, updated_at = now() WHERE id = ${orderId}::uuid
    `;
  }
  return next;
}

