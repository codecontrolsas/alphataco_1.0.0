import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import type { PurchaseOrderInput } from '../schemas/orders';
import { nextPurchaseDocumentNumber } from './document-number';
import { recomputeRequestProgress } from './order-progress';
import { computeOrderLine, computeOrderTotals } from './order-totals';
import { validatePurchaseOrderInput, type ValidatedOrderLine } from './orders';
import { PurchaseError } from './purchase-errors';
import { dateColumn } from './requests';

/**
 * Escrituras de una orden de compra dentro de una transacción: líneas, borrador complementario,
 * lectura de la orden guardada y alta ya validada. Las usan las acciones de alta, edición y envío.
 */
type Tx = Prisma.TransactionClient;

export async function writeOrderLines(tx: Tx, orderId: string, lines: ValidatedOrderLine[]) {
  await tx.purchase_order_lines.createMany({
    data: lines.map((line, i) => ({ ...line, order_id: orderId, position: i + 1 })),
  });
}

/** Si todas las lineas con precio cotizado salen de UNA cotizacion, la OC queda vinculada a ella. */
export async function quoteIdOf(tx: Tx, lines: readonly { quote_line_id: string | null }[]): Promise<string | null> {
  const quoteLineIds = [...new Set(lines.flatMap((line) => (line.quote_line_id ? [line.quote_line_id] : [])))];
  if (quoteLineIds.length === 0) return null;
  const quotes = await tx.purchase_quote_lines.findMany({
    where: { id: { in: quoteLineIds } },
    select: { quote_id: true },
    distinct: ['quote_id'],
  });
  return quotes.length === 1 ? quotes[0].quote_id : null;
}

/**
 * Borrador de una OC complementaria: solo se corrigen precio, alicuota, notas y condiciones. Las
 * lineas NO se reescriben (las lineas de la recepcion del excedente las apuntan) y proveedor,
 * lineas y cantidades son las que llegaron.
 */
export async function updateComplementDraft(tx: Tx, orderId: string, input: PurchaseOrderInput): Promise<void> {
  const order = await tx.purchase_orders.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      supplier_id: true,
      lines: { orderBy: { position: 'asc' }, select: { id: true, request_line_id: true, quantity: true } },
    },
  });
  const unchanged =
    input.supplierId === order.supplier_id &&
    input.lines.length === order.lines.length &&
    input.lines.every((line, i) => {
      const current = order.lines[i]!;
      return (
        line.requestLineId === current.request_line_id && new Prisma.Decimal(line.quantity).equals(current.quantity)
      );
    });
  if (!unchanged) {
    throw new PurchaseError(
      'En una OC complementaria solo se corrigen el precio, la alícuota y las notas: el proveedor y las cantidades son las que llegaron'
    );
  }
  for (const [i, line] of input.lines.entries()) {
    const amounts = computeOrderLine(line);
    if (!amounts) throw new PurchaseError(`Línea ${i + 1}: revisá el precio y la alícuota`);
    await tx.purchase_order_lines.update({
      where: { id: order.lines[i]!.id },
      data: {
        unit_price: new Prisma.Decimal(line.unitPrice),
        vat_rate_id: line.vatRateId,
        net_total: new Prisma.Decimal(amounts.netTotal),
        vat_amount: new Prisma.Decimal(amounts.vatAmount),
        quote_line_id: null,
      },
    });
  }
  const totals = computeOrderTotals(input.lines);
  await tx.purchase_orders.update({
    where: { id: orderId },
    data: {
      delivery_date: dateColumn(input.deliveryDate),
      delivery_place: input.deliveryPlace,
      payment_term_days: input.paymentTermDays,
      notes: input.notes,
      subtotal: new Prisma.Decimal(totals.subtotal),
      vat_total: new Prisma.Decimal(totals.vatTotal),
      total: new Prisma.Decimal(totals.total),
    },
  });
}

export async function isComplementOrder(tx: Tx, orderId: string): Promise<boolean> {
  const order = await tx.purchase_orders.findUniqueOrThrow({
    where: { id: orderId },
    select: { complements_order_id: true },
  });
  return order.complements_order_id !== null;
}

export async function requestIdsOfOrder(tx: Tx, orderId: string): Promise<string[]> {
  const lines = await tx.purchase_order_lines.findMany({
    where: { order_id: orderId },
    select: { request_line: { select: { request_id: true } } },
  });
  return [...new Set(lines.map((line) => line.request_line.request_id))];
}

export async function inputFromStoredOrder(tx: Tx, orderId: string): Promise<PurchaseOrderInput> {
  const order = await tx.purchase_orders.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      supplier_id: true,
      delivery_date: true,
      delivery_place: true,
      payment_term_days: true,
      notes: true,
      lines: {
        orderBy: { position: 'asc' },
        select: { request_line_id: true, quote_line_id: true, quantity: true, unit_price: true, vat_rate_id: true },
      },
    },
  });
  return {
    supplierId: order.supplier_id,
    deliveryDate: order.delivery_date ? order.delivery_date.toISOString().slice(0, 10) : null,
    deliveryPlace: order.delivery_place,
    paymentTermDays: order.payment_term_days,
    notes: order.notes,
    lines: order.lines.map((line) => ({
      requestLineId: line.request_line_id,
      quoteLineId: line.quote_line_id,
      quantity: line.quantity.toString(),
      unitPrice: line.unit_price.toString(),
      vatRateId: line.vat_rate_id,
    })),
  };
}

/** Alta de una OC ya validada (la usan el alta directa y la que sale de una cotizacion). */
export async function insertPurchaseOrder(
  tx: Tx,
  companyId: string,
  profileId: string,
  input: PurchaseOrderInput,
  options: { submit: boolean; quoteId?: string | null }
) {
  const validated = await validatePurchaseOrderInput(tx, companyId, input);
  const number = await nextPurchaseDocumentNumber(tx, companyId, 'order');
  const order = await tx.purchase_orders.create({
    data: {
      number,
      supplier_id: validated.supplier.id,
      quote_id: options.quoteId !== undefined ? options.quoteId : await quoteIdOf(tx, validated.lines),
      status: options.submit ? 'PENDING_APPROVAL' : 'DRAFT',
      created_by: profileId,
      delivery_date: dateColumn(input.deliveryDate),
      delivery_place: input.deliveryPlace,
      // Sin plazo en el formulario: el de la ficha del proveedor.
      payment_term_days: input.paymentTermDays ?? validated.supplier.paymentTermDays,
      notes: input.notes,
      subtotal: new Prisma.Decimal(validated.totals.subtotal),
      vat_total: new Prisma.Decimal(validated.totals.vatTotal),
      total: new Prisma.Decimal(validated.totals.total),
      submitted_at: options.submit ? new Date() : null,
    },
    select: { id: true, number: true },
  });
  await writeOrderLines(tx, order.id, validated.lines);
  await recomputeRequestProgress(tx, validated.requestIds);
  return order;
}
