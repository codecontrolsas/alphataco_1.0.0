'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { destinationLabel } from '@/features/Warehouses/lib/labels';
import { prisma } from '@/shared/lib/prisma';
import { buildStorageFileUrl } from '@/shared/lib/storage-url';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { remainingOf, requestLineLabel } from '../lib/order-progress';
import { canApplyPurchaseOrderAction, type PurchaseOrderStatus } from '../lib/order-state-machine';
import { receivedByOrderLine } from '../lib/orders';
import { ORDER_LINE_SELECT } from '../lib/receipt-order-lines';
import { SUPPLIER_FILES_BUCKET } from '../lib/storage-files';
import { userName } from '../lib/user-name';

/** Datos para el formulario: la OC, sus lineas con algo por recibir y los depositos activos. */
export async function getReceiptFormData(orderId: string) {
  if (!(await checkPermissionServer('compras', 'recepciones', 'create'))) return null;
  if (!isUuid(orderId)) return null;
  const companyId = await getActiveCompanyId();
  const order = await prisma.purchase_orders.findFirst({
    where: { id: orderId, company_id: companyId },
    select: {
      id: true,
      number: true,
      status: true,
      supplier: { select: { id: true, name: true } },
      lines: { select: ORDER_LINE_SELECT, orderBy: { position: 'asc' } },
    },
  });
  if (!order) return null;
  const status = order.status as PurchaseOrderStatus;
  const [received, warehouses] = await Promise.all([
    receivedByOrderLine(
      prisma,
      order.lines.map((line) => line.id)
    ),
    prisma.warehouses.findMany({
      where: { company_id: companyId, is_active: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return {
    order: {
      id: order.id,
      number: order.number,
      supplier: order.supplier,
      canReceive: canApplyPurchaseOrderAction(status, 'receive'),
    },
    warehouses,
    lines: order.lines.map((line) => {
      const material = line.request_line.material;
      return {
        orderLineId: line.id,
        position: line.position,
        itemLabel: requestLineLabel({
          code: material?.code ?? null,
          name: material?.name ?? null,
          description: line.request_line.description,
        }),
        isMaterial: material !== null,
        trackingType: material?.tracking_type ?? null,
        unitAbbr: line.request_line.unit.abbreviation,
        ordered: line.quantity.toString(),
        received: received.get(line.id) ?? '0',
        remaining: remainingOf(line.quantity.toString(), received.get(line.id) ?? '0'),
        request: { id: line.request_line.request.id, number: line.request_line.request.number },
        destination: destinationLabel(line.request_line.request),
      };
    }),
  };
}

export type ReceiptFormData = NonNullable<Awaited<ReturnType<typeof getReceiptFormData>>>;

/** Detalle de la recepcion: OC, deposito, remito, lineas, movimientos, complementaria e historial. */
export async function getPurchaseReceiptDetail(id: string) {
  if (!isUuid(id)) return null;
  const [canView, canUpdate] = await Promise.all([
    checkPermissionServer('compras', 'recepciones', 'view'),
    checkPermissionServer('compras', 'recepciones', 'update'),
  ]);
  if (!canView) return null;
  const companyId = await getActiveCompanyId();
  const receipt = await prisma.purchase_receipts.findFirst({
    where: { id, company_id: companyId },
    select: {
      id: true,
      number: true,
      received_on: true,
      delivery_note: true,
      attachment_path: true,
      attachment_name: true,
      notes: true,
      created_at: true,
      cancelled_at: true,
      cancel_reason: true,
      order: { select: { id: true, number: true } },
      supplier: { select: { id: true, name: true } },
      warehouse: { select: { id: true, name: true } },
      stock_movement: { select: { id: true, number: true } },
      reversal_movement: { select: { id: true, number: true } },
      creator: { select: { fullname: true, email: true } },
      canceller: { select: { fullname: true, email: true } },
      complement_orders: { select: { id: true, number: true, status: true } },
      lines: {
        select: {
          id: true,
          quantity: true,
          batch_number: true,
          batch_expires_on: true,
          serial_numbers: true,
          order_line: {
            select: {
              order_id: true,
              request_line: {
                select: {
                  description: true,
                  material: { select: { code: true, name: true } },
                  unit: { select: { abbreviation: true } },
                  request: { select: { id: true, number: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!receipt) return null;
  const at = (d: Date | null) => d?.toISOString() ?? null;
  const cancelled = receipt.cancelled_at !== null;
  const complements = receipt.complement_orders.map((c) => ({ ...c, status: c.status as PurchaseOrderStatus }));

  return {
    id: receipt.id,
    number: receipt.number,
    cancelled,
    cancelReason: receipt.cancel_reason,
    receivedOn: receipt.received_on.toISOString().slice(0, 10),
    deliveryNote: receipt.delivery_note,
    notes: receipt.notes,
    attachment: receipt.attachment_path
      ? {
          name: receipt.attachment_name ?? 'remito',
          url: buildStorageFileUrl(SUPPLIER_FILES_BUCKET, receipt.attachment_path),
        }
      : null,
    order: receipt.order,
    supplier: receipt.supplier,
    warehouse: receipt.warehouse,
    movement: receipt.stock_movement,
    reversal: receipt.reversal_movement,
    complements,
    // El excedente esta en el stock pero su OC complementaria se anulo (y la recepcion sigue vigente).
    excessWithoutOrder: !cancelled && complements.length > 0 && complements.every((c) => c.status === 'CANCELLED'),
    lines: receipt.lines.map((line) => {
      const requestLine = line.order_line.request_line;
      return {
        id: line.id,
        itemLabel: requestLineLabel({
          code: requestLine.material?.code ?? null,
          name: requestLine.material?.name ?? null,
          description: requestLine.description,
        }),
        unitAbbr: requestLine.unit.abbreviation,
        quantity: line.quantity.toString(),
        batchNumber: line.batch_number,
        batchExpiresOn: line.batch_expires_on ? line.batch_expires_on.toISOString().slice(0, 10) : null,
        serialNumbers: line.serial_numbers,
        isExcess: line.order_line.order_id !== receipt.order.id,
        request: requestLine.request,
      };
    }),
    history: [
      { event: 'Registrada', at: at(receipt.created_at), by: userName(receipt.creator), notes: receipt.notes },
      ...(receipt.cancelled_at
        ? [
            {
              event: 'Anulada',
              at: at(receipt.cancelled_at),
              by: userName(receipt.canceller),
              notes: receipt.cancel_reason,
            },
          ]
        : []),
    ],
    can: { cancel: !cancelled && canUpdate },
  };
}

export type PurchaseReceiptDetail = NonNullable<Awaited<ReturnType<typeof getPurchaseReceiptDetail>>>;
