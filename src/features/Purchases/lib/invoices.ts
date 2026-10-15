import 'server-only';

import { QUANTITY_SCALE, formatScaled, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { formatVoucherLabel } from '@/features/Comercial/Facturacion/lib/invoice-type';
import type { Prisma } from '@/generated/prisma/client';
import { CBTE_TYPES, isCbteTypeId, type VoucherKind, type VoucherLetter } from '@/shared/lib/arca/catalogs';
import type { SupplierInvoiceInput } from '../schemas/invoices';
import type { InvoiceControlLine } from './invoice-control';
import { INVOICED_STATUSES, type SupplierInvoiceStatus } from './invoice-status';
import { requestLineLabel } from './order-progress';
import type { PurchaseOrderStatus } from './order-state-machine';
import { receivedByOrderLine } from './orders';
import { PurchaseError } from './purchase-errors';

/**
 * Lecturas y locks de los comprobantes de proveedor (spec Compras etapa 4 §3). Orden de locks:
 * OC del comprobante (por id) -> el comprobante. Lo facturado de una linea de OC tiene UNA sola
 * definicion (`invoicedByOrderLine`): la usan el control, el detalle de la OC y el formulario.
 */

/** Tipos de comprobante que acreditan (NC): restan de lo facturado. */
export const CREDIT_NOTE_TYPES: number[] = Object.entries(CBTE_TYPES)
  .filter(([, info]) => info.kind === 'credit_note')
  .map(([id]) => Number(id));

/** ¿El tipo de comprobante acredita (NC)? Misma regla que el calculo de saldos de pagos. */
export function isCreditNoteCbte(cbteType: number): boolean {
  return isCbteTypeId(cbteType) && CBTE_TYPES[cbteType].kind === 'credit_note';
}

export function voucherInfo(cbteType: number): { letter: VoucherLetter; kind: VoucherKind } {
  if (!isCbteTypeId(cbteType)) throw new PurchaseError('Tipo de comprobante inválido');
  return { letter: CBTE_TYPES[cbteType].letter, kind: CBTE_TYPES[cbteType].kind };
}

export function supplierInvoiceLabel(row: { cbte_type: number; sales_point: number; number: bigint | number | string }): string {
  return formatVoucherLabel(row.cbte_type, row.sales_point, Number(row.number));
}

export interface LockedSupplierInvoice {
  id: string;
  supplierId: string;
  label: string;
  status: SupplierInvoiceStatus;
}

/** Lockea un comprobante VIGENTE (`FOR UPDATE`). */
export async function lockSupplierInvoice(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  companyId: string,
  invoiceId: string
): Promise<LockedSupplierInvoice> {
  const rows = await tx.$queryRaw<
    { id: string; supplier_id: string; cbte_type: number; sales_point: number; number: bigint; status: SupplierInvoiceStatus }[]
  >`
    SELECT id, supplier_id, cbte_type, sales_point, number, status::text AS status
    FROM supplier_invoices
    WHERE id = ${invoiceId}::uuid AND company_id = ${companyId}::uuid
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new PurchaseError('El comprobante no existe');
  const label = supplierInvoiceLabel(row);
  if (row.status === 'CANCELLED') throw new PurchaseError(`La ${label} ya fue anulada`);
  return { id: row.id, supplierId: row.supplier_id, label, status: row.status };
}

/** Lockea (`FOR UPDATE`, por id) las OC de esas lineas de OC de la empresa. Devuelve sus ids. */
export async function lockOrdersForLines(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  companyId: string,
  orderLineIds: readonly string[]
): Promise<Set<string>> {
  const ids = [...new Set(orderLineIds)];
  if (ids.length === 0) return new Set();
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT o.id FROM purchase_orders o
    WHERE o.company_id = ${companyId}::uuid
      AND o.id IN (SELECT ol.order_id FROM purchase_order_lines ol WHERE ol.id = ANY(${ids}::uuid[]))
    ORDER BY o.id
    FOR UPDATE
  `;
  return new Set(rows.map((row) => row.id));
}

/** Lineas de OC de un comprobante (sin lock). */
export async function invoiceOrderLineIds(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  companyId: string,
  invoiceId: string
): Promise<string[]> {
  const rows = await tx.$queryRaw<{ order_line_id: string }[]>`
    SELECT DISTINCT il.order_line_id
    FROM supplier_invoice_lines il
    JOIN supplier_invoices si ON si.id = il.invoice_id
    WHERE il.invoice_id = ${invoiceId}::uuid AND si.company_id = ${companyId}::uuid AND il.order_line_id IS NOT NULL
  `;
  return rows.map((row) => row.order_line_id);
}

/**
 * Las lineas de OC del comprobante, leidas DESPUES de lockearlo, tienen que ser de OC ya lockeadas.
 * Si otra edicion las cambio mientras se esperaba el lock, se aborta (lockear ahora invertiria el
 * orden OC -> comprobante).
 */
export async function assertInvoiceLinesLocked(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  invoiceId: string,
  lockedOrderIds: Set<string>
): Promise<void> {
  const rows = await tx.$queryRaw<{ order_id: string }[]>`
    SELECT DISTINCT ol.order_id
    FROM supplier_invoice_lines il
    JOIN purchase_order_lines ol ON ol.id = il.order_line_id
    WHERE il.invoice_id = ${invoiceId}::uuid
  `;
  if (rows.some((row) => !lockedOrderIds.has(row.order_id))) {
    throw new PurchaseError('El comprobante cambió mientras lo guardabas: volvé a abrirlo e intentá de nuevo');
  }
}

/**
 * Lo facturado neto de una linea de OC nunca queda negativo (mas NC que facturas). Se llama despues
 * de anular, rechazar o editar un comprobante, dentro de la transaccion y con las OC lockeadas.
 */
export async function assertNoNegativeInvoiced(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  orderLineIds: readonly string[]
): Promise<void> {
  const invoiced = await invoicedByOrderLine(tx, orderLineIds);
  const negative = [...invoiced.entries()].filter(([, qty]) => qty.startsWith('-')).map(([id]) => id);
  if (negative.length === 0) return;
  const rows = await tx.$queryRaw<{ number: string; description: string | null; code: string | null; name: string | null }[]>`
    SELECT o.number, rl.description, m.code, m.name
    FROM purchase_order_lines ol
    JOIN purchase_orders o ON o.id = ol.order_id
    JOIN purchase_request_lines rl ON rl.id = ol.request_line_id
    LEFT JOIN materials m ON m.id = rl.material_id
    WHERE ol.id = ${negative[0]!}::uuid
  `;
  const row = rows[0]!;
  const label = requestLineLabel({ code: row.code, name: row.name, description: row.description });
  throw new PurchaseError(
    `${label} de la ${row.number} quedaría con facturado negativo: anulá o corregí antes la nota de crédito que la acredita`
  );
}

/**
 * Facturado neto por linea de OC: facturas y ND menos NC, de comprobantes vigentes no rechazados.
 * `excludeInvoiceId`: el comprobante que se esta editando no cuenta contra si mismo.
 */
export async function invoicedByOrderLine(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  orderLineIds: readonly string[],
  options: { excludeInvoiceId?: string } = {}
): Promise<Map<string, string>> {
  const ids = [...new Set(orderLineIds)];
  const result = new Map(ids.map((id) => [id, formatScaled(BigInt(0), QUANTITY_SCALE)]));
  if (ids.length === 0) return result;
  const exclude = options.excludeInvoiceId ?? null;
  const statuses: string[] = INVOICED_STATUSES;
  const rows = await tx.$queryRaw<{ order_line_id: string; invoiced: string }[]>`
    SELECT il.order_line_id,
           SUM(CASE WHEN si.cbte_type = ANY(${CREDIT_NOTE_TYPES}::int[]) THEN -il.quantity ELSE il.quantity END)::text AS invoiced
    FROM supplier_invoice_lines il
    JOIN supplier_invoices si ON si.id = il.invoice_id
    WHERE il.order_line_id = ANY(${ids}::uuid[])
      AND si.status::text = ANY(${statuses}::text[])
      AND (${exclude}::uuid IS NULL OR si.id <> ${exclude}::uuid)
    GROUP BY il.order_line_id
  `;
  for (const row of rows) {
    result.set(row.order_line_id, formatScaled(parseScaled(row.invoiced, QUANTITY_SCALE) ?? BigInt(0), QUANTITY_SCALE));
  }
  return result;
}

/**
 * Anular una recepcion no puede dejar comprobantes vigentes que facturen mas de lo recibido, ni
 * comprobantes sobre las OC complementarias que se anulan con ella. Llamar dentro de la transaccion,
 * con la OC y las complementarias lockeadas y ANTES de revertir nada. Si no cubre, aborta nombrando
 * los comprobantes.
 */
export async function assertReceiptCancellationKeepsInvoicesCovered(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  receiptId: string,
  complementOrderIds: readonly string[]
): Promise<void> {
  const ZERO = BigInt(0);
  const big = (value: string) => parseScaled(value, QUANTITY_SCALE) ?? ZERO;
  const removedRows = await tx.$queryRaw<{ order_line_id: string; quantity: string }[]>`
    SELECT order_line_id, SUM(quantity)::text AS quantity
    FROM purchase_receipt_lines WHERE receipt_id = ${receiptId}::uuid GROUP BY order_line_id
  `;
  const complementRows = complementOrderIds.length
    ? await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM purchase_order_lines WHERE order_id = ANY(${[...complementOrderIds]}::uuid[])
      `
    : [];
  const removed = new Map(removedRows.map((row) => [row.order_line_id, big(row.quantity)]));
  const complementLineIds = complementRows.map((row) => row.id);
  const lineIds = [...removed.keys(), ...complementLineIds];
  if (lineIds.length === 0) return;

  const [received, invoiced] = await Promise.all([receivedByOrderLine(tx, lineIds), invoicedByOrderLine(tx, lineIds)]);
  const offenders = new Set<string>();
  for (const id of complementLineIds) {
    if ((big(invoiced.get(id) ?? '0')) > ZERO) offenders.add(id);
  }
  for (const [id, qty] of removed) {
    if (big(invoiced.get(id) ?? '0') > big(received.get(id) ?? '0') - qty) offenders.add(id);
  }
  if (offenders.size === 0) return;

  const statuses: string[] = INVOICED_STATUSES;
  const invoices = await tx.$queryRaw<{ cbte_type: number; sales_point: number; number: bigint }[]>`
    SELECT DISTINCT si.cbte_type, si.sales_point, si.number
    FROM supplier_invoice_lines il
    JOIN supplier_invoices si ON si.id = il.invoice_id
    WHERE il.order_line_id = ANY(${[...offenders]}::uuid[])
      AND si.status::text = ANY(${statuses}::text[])
      AND si.cbte_type <> ALL(${CREDIT_NOTE_TYPES}::int[])
    ORDER BY si.cbte_type, si.sales_point, si.number
  `;
  const labels = invoices.map(supplierInvoiceLabel);
  throw new PurchaseError(
    labels.length > 1
      ? `Tiene las ${labels.join(', ')} que facturan lo recibido: anulalas o emití una NC primero.`
      : `Tiene la ${labels[0] ?? 'factura'} que factura lo recibido: anulala o emití una NC primero.`
  );
}

type ControlTx = Pick<Prisma.TransactionClient, '$queryRaw' | 'purchase_order_lines'>;

/**
 * Lineas de OC del comprobante con lo que necesita el control: OC, estado, proveedor, precio,
 * alicuota, item, recibido y facturado por OTROS comprobantes. Llamar despues de lockear las OC.
 */
export async function loadOrderLinesForControl(
  tx: ControlTx,
  companyId: string,
  supplierId: string,
  input: SupplierInvoiceInput,
  options: { excludeInvoiceId?: string } = {}
): Promise<InvoiceControlLine[]> {
  const orderLines = input.lines.flatMap((line, i) => (line.kind === 'order' ? [{ ...line, index: i }] : []));
  const ids = [...new Set(orderLines.map((l) => l.orderLineId))];
  const rows = ids.length
    ? await tx.purchase_order_lines.findMany({
        where: { id: { in: ids }, order: { company_id: companyId } },
        select: {
          id: true,
          unit_price: true,
          vat_rate_id: true,
          order: { select: { number: true, status: true, supplier_id: true } },
          request_line: {
            select: { description: true, material: { select: { code: true, name: true } }, unit: { select: { abbreviation: true } } },
          },
        },
      })
    : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (ids.some((id) => !byId.has(id))) throw new PurchaseError('La línea de OC no existe');

  const [received, invoiced] = await Promise.all([
    receivedByOrderLine(tx, ids),
    invoicedByOrderLine(tx, ids, { excludeInvoiceId: options.excludeInvoiceId }),
  ]);

  return input.lines.map((line, i): InvoiceControlLine => {
    if (line.kind === 'expense') return { kind: 'expense', lineId: String(i), label: line.description };
    const row = byId.get(line.orderLineId)!;
    return {
      kind: 'order',
      lineId: String(i),
      orderLineId: row.id,
      label: requestLineLabel({
        code: row.request_line.material?.code ?? null,
        name: row.request_line.material?.name ?? null,
        description: row.request_line.description,
      }),
      orderNumber: row.order.number,
      supplierMatches: row.order.supplier_id === supplierId,
      orderStatus: row.order.status as PurchaseOrderStatus,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vatRateId: line.vatRateId,
      orderPrice: row.unit_price.toString(),
      orderVatRateId: row.vat_rate_id,
      invoicedOthers: invoiced.get(row.id) ?? '0',
      received: received.get(row.id) ?? '0',
      unit: row.request_line.unit.abbreviation,
    };
  });
}

/** Comprobantes de una OC y lo facturado por linea (para el detalle de la OC). */
export async function getOrderInvoicesSummary(
  db: Pick<Prisma.TransactionClient, '$queryRaw' | 'supplier_invoices'>,
  companyId: string,
  orderId: string,
  orderLineIds: string[]
) {
  const [invoiced, invoices] = await Promise.all([
    invoicedByOrderLine(db, orderLineIds),
    db.supplier_invoices.findMany({
      where: { company_id: companyId, lines: { some: { order_line: { order_id: orderId } } } },
      select: { id: true, cbte_type: true, sales_point: true, number: true, issue_date: true, total: true, status: true },
      orderBy: { issue_date: 'asc' },
    }),
  ]);
  return {
    invoiced,
    invoices: invoices.map((i) => ({
      id: i.id,
      label: supplierInvoiceLabel(i),
      issueDate: i.issue_date.toISOString().slice(0, 10),
      total: i.total.toString(),
      status: i.status as SupplierInvoiceStatus,
      countsAsInvoiced: (INVOICED_STATUSES as string[]).includes(i.status),
    })),
  };
}
