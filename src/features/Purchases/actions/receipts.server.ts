'use server';

import { QUANTITY_SCALE, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { DESTINATION_SELECT, destinationLabel } from '@/features/Warehouses/lib/labels';
import { registerStockMovement, reverseStockMovement } from '@/features/Warehouses/lib/stock-engine';
import { hasTireMaterials, linkTiresFromEntry } from '@/features/Warehouses/lib/tire-stock';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { storageRemove, storageUpload } from '@/shared/lib/storage';
import { buildStorageFileUrl } from '@/shared/lib/storage-url';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { revalidatePath } from 'next/cache';
import { NO_PERMISSION, firstIssue, toPurchaseActionError } from '../lib/action-errors';
import { nextPurchaseDocumentNumber } from '../lib/document-number';
import { assertReceiptCancellationKeepsInvoicesCovered } from '../lib/invoices';
import { lockRequestsForLines, recomputeRequestProgress, remainingOf, requestLineLabel } from '../lib/order-progress';
import { canApplyPurchaseOrderAction, type PurchaseOrderStatus } from '../lib/order-state-machine';
import { computeOrderLine, computeOrderTotals } from '../lib/order-totals';
import { lockPurchaseOrder, receivedByOrderLine, recomputeOrderReceiptStatus } from '../lib/orders';
import { PurchaseError } from '../lib/purchase-errors';
import { splitReceived } from '../lib/receipt-math';
import { lockOrderRow, lockPurchaseReceipt } from '../lib/receipts';
import { SUPPLIER_FILES_BUCKET, safeFileName } from '../lib/storage-files';
import {
  RECEIPT_ATTACHMENT_MAX_BYTES,
  RECEIPT_ATTACHMENT_TYPES,
  purchaseReceiptFormSchema,
  toPurchaseReceiptInput,
  type PurchaseReceiptFormValues,
} from '../schemas/receipts';
import { requiredReasonSchema } from '../schemas/requests';

const logger = new Logger('features/Purchases/receipts');

const PURCHASES_PATH = '/dashboard/purchases';
const SESSION_EXPIRED = 'Tu sesión expiró. Volvé a ingresar.';
/** Mismas opciones que Almacenes: el motor de stock puede tardar con muchas lineas. */
const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 };

function revalidate() {
  revalidatePath(PURCHASES_PATH, 'layout');
  revalidatePath('/dashboard/warehouse', 'layout');
}

const ZERO = BigInt(0);
const scaled = (value: string) => parseScaled(value, QUANTITY_SCALE) ?? ZERO;

/** Lineas de la OC con lo necesario para recibir: material y su control, precio y destino. */
const ORDER_LINE_SELECT = {
  id: true,
  position: true,
  quantity: true,
  unit_price: true,
  vat_rate_id: true,
  request_line_id: true,
  request_line: {
    select: {
      position: true,
      description: true,
      material: { select: { id: true, code: true, name: true, tracking_type: true } },
      unit: { select: { abbreviation: true } },
      request: { select: { id: true, number: true, ...DESTINATION_SELECT } },
    },
  },
} as const;

/**
 * Registra una recepcion contra una OC enviada o recibida en parte (spec Compras etapa 3 §3).
 *
 * En UNA transaccion: lock de la OC -> lock de las solicitudes -> numero RC -> OC complementaria
 * por el excedente (si hay) -> recepcion y lineas -> entrada a Almacenes por el motor (lineas de
 * material) y alta de cubiertas en Gomeria -> estado de la OC y avance de las solicitudes. Si el
 * motor rechaza algo, no queda nada.
 */
export async function createPurchaseReceipt(values: PurchaseReceiptFormValues): Promise<
  ActionResult<{
    id: string;
    number: string;
    movementNumber: string | null;
    warehouseName: string | null;
    complementNumber: string | null;
  }>
> {
  if (!(await checkPermissionServer('compras', 'recepciones', 'create'))) return fail(NO_PERMISSION);
  const parsed = purchaseReceiptFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const input = toPurchaseReceiptInput(parsed.data);

  try {
    const result = await withActor(
      profile.credentialId,
      async (tx) => {
        const order = await lockPurchaseOrder(tx, companyId, input.orderId, 'receive');
        const orderRow = await tx.purchase_orders.findUniqueOrThrow({
          where: { id: order.id },
          select: {
            number: true,
            payment_term_days: true,
            supplier_id: true,
            lines: { select: ORDER_LINE_SELECT, orderBy: { position: 'asc' } },
          },
        });
        const byId = new Map(orderRow.lines.map((line) => [line.id, line]));
        const seen = new Set<string>();
        for (const line of input.lines) {
          if (!byId.has(line.orderLineId)) throw new PurchaseError('Una de las líneas no es de esta orden de compra');
          if (seen.has(line.orderLineId)) throw new PurchaseError('Una línea de la orden aparece dos veces');
          seen.add(line.orderLineId);
        }

        // Orden de locks: OC -> solicitudes -> (numeracion) -> motor de stock.
        await lockRequestsForLines(
          tx,
          companyId,
          orderRow.lines.map((line) => line.request_line_id)
        );

        const materialLines = input.lines.filter((line) => byId.get(line.orderLineId)!.request_line.material);
        let warehouse: { id: string; name: string } | null = null;
        if (materialLines.length > 0) {
          if (!input.warehouseId || !isUuid(input.warehouseId))
            throw new PurchaseError('Elegí el depósito donde entra el material');
          const found = await tx.warehouses.findFirst({
            where: { id: input.warehouseId, company_id: companyId },
            select: { id: true, name: true, is_active: true },
          });
          if (!found) throw new PurchaseError('El depósito no existe');
          if (!found.is_active) throw new PurchaseError(`El depósito ${found.name} está inactivo`);
          warehouse = { id: found.id, name: found.name };
        }

        const received = await receivedByOrderLine(
          tx,
          orderRow.lines.map((line) => line.id)
        );
        const split = input.lines.map((line) => {
          const orderLine = byId.get(line.orderLineId)!;
          const remaining = remainingOf(orderLine.quantity.toString(), received.get(orderLine.id) ?? '0');
          return { line, orderLine, ...splitReceived({ remaining, received: line.quantity }) };
        });

        const number = await nextPurchaseDocumentNumber(tx, companyId, 'receipt');
        const receipt = await tx.purchase_receipts.create({
          data: {
            number,
            order_id: order.id,
            supplier_id: orderRow.supplier_id,
            warehouse_id: warehouse?.id ?? null,
            received_on: new Date(`${input.receivedOn}T00:00:00.000Z`),
            delivery_note: input.deliveryNote,
            notes: input.notes,
            created_by: profile.id,
          },
          select: { id: true },
        });

        // Excedente -> OC complementaria en borrador, mismo proveedor y precio.
        const excess = split.filter((s) => scaled(s.excess) > ZERO);
        const complementLineByOrderLine = new Map<string, string>();
        let complementNumber: string | null = null;
        if (excess.length > 0) {
          complementNumber = await nextPurchaseDocumentNumber(tx, companyId, 'order');
          const lineInputs = excess.map((s) => ({
            quantity: s.excess,
            unitPrice: s.orderLine.unit_price.toString(),
            vatRateId: s.orderLine.vat_rate_id,
          }));
          const totals = computeOrderTotals(lineInputs);
          const complement = await tx.purchase_orders.create({
            data: {
              number: complementNumber,
              supplier_id: orderRow.supplier_id,
              status: 'DRAFT',
              created_by: profile.id,
              payment_term_days: orderRow.payment_term_days,
              notes: `Regulariza el excedente recibido en ${number} (${orderRow.number})`,
              subtotal: new Prisma.Decimal(totals.subtotal),
              vat_total: new Prisma.Decimal(totals.vatTotal),
              total: new Prisma.Decimal(totals.total),
              complements_order_id: order.id,
              complements_receipt_id: receipt.id,
            },
            select: { id: true },
          });
          for (const [i, s] of excess.entries()) {
            const amounts = computeOrderLine(lineInputs[i]!)!;
            const created = await tx.purchase_order_lines.create({
              data: {
                order_id: complement.id,
                request_line_id: s.orderLine.request_line_id,
                position: i + 1,
                quantity: new Prisma.Decimal(s.excess),
                unit_price: s.orderLine.unit_price,
                vat_rate_id: s.orderLine.vat_rate_id,
                net_total: new Prisma.Decimal(amounts.netTotal),
                vat_amount: new Prisma.Decimal(amounts.vatAmount),
              },
              select: { id: true },
            });
            complementLineByOrderLine.set(s.orderLine.id, created.id);
          }
        }

        // Lineas de la recepcion: lo que cubre la OC va a su linea; el excedente, a la complementaria.
        // En los serializados, las primeras series son las de la OC.
        for (const s of split) {
          const withinCount = Number(s.withinOrder);
          const parts: { orderLineId: string; quantity: string; serials: string[] }[] = [];
          if (scaled(s.withinOrder) > ZERO) {
            parts.push({
              orderLineId: s.orderLine.id,
              quantity: s.withinOrder,
              serials: s.line.serialNumbers.slice(0, withinCount),
            });
          }
          if (scaled(s.excess) > ZERO) {
            parts.push({
              orderLineId: complementLineByOrderLine.get(s.orderLine.id)!,
              quantity: s.excess,
              serials: s.line.serialNumbers.slice(withinCount),
            });
          }
          for (const part of parts) {
            await tx.purchase_receipt_lines.create({
              data: {
                receipt_id: receipt.id,
                order_line_id: part.orderLineId,
                quantity: new Prisma.Decimal(part.quantity),
                unit_cost: s.orderLine.unit_price,
                batch_number: s.line.batchNumber,
                batch_expires_on: s.line.batchExpiresOn ? new Date(`${s.line.batchExpiresOn}T00:00:00.000Z`) : null,
                serial_numbers: part.serials,
              },
            });
          }
        }

        // Entrada a Almacenes (solo materiales), por el motor: el es quien valida lote y series.
        let movementNumber: string | null = null;
        if (warehouse && materialLines.length > 0) {
          const movement = await registerStockMovement(tx, companyId, profile.id, {
            type: 'ENTRY',
            warehouseId: warehouse.id,
            targetWarehouseId: null,
            occurredOn: new Date(`${input.receivedOn}T00:00:00.000Z`),
            reference: `${number} · ${orderRow.number}`,
            notes: input.notes,
            destinationType: null,
            employeeId: null,
            vehicleId: null,
            otherEquipmentId: null,
            maintenanceOrderId: null,
            customerId: null,
            customerServiceId: null,
            lines: materialLines.map((line) => {
              const orderLine = byId.get(line.orderLineId)!;
              return {
                materialId: orderLine.request_line.material!.id,
                quantity: line.quantity,
                unitCost: orderLine.unit_price.toString(),
                adjustmentDirection: null,
                batchId: null,
                batchNumber: line.batchNumber,
                batchExpiresOn: line.batchExpiresOn ? new Date(`${line.batchExpiresOn}T00:00:00.000Z`) : null,
                serialNumbers: line.serialNumbers,
                unitIds: [],
              };
            }),
          });
          await linkTiresFromEntry(tx, companyId, movement.id);
          await tx.purchase_receipts.update({ where: { id: receipt.id }, data: { stock_movement_id: movement.id } });
          movementNumber = movement.number;
        }

        await recomputeOrderReceiptStatus(tx, order.id);
        await recomputeRequestProgress(tx, [...new Set(orderRow.lines.map((line) => line.request_line.request.id))]);

        return { id: receipt.id, number, movementNumber, warehouseName: warehouse?.name ?? null, complementNumber };
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    logger.info('Recepción registrada', {
      data: { number: result.number, movement: result.movementNumber, complement: result.complementNumber },
    });
    revalidate();
    return ok(result);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'registrar la recepción');
  }
}

/** Adjunta el remito escaneado. El archivo anterior no se borra (queda en el storage). */
export async function uploadPurchaseReceiptAttachment(id: string, formData: FormData): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'recepciones', 'create'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La recepción no existe');
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return fail('Elegí el archivo');
  if (file.size > RECEIPT_ATTACHMENT_MAX_BYTES) return fail('El archivo supera los 10 MB');
  if (!(RECEIPT_ATTACHMENT_TYPES as readonly string[]).includes(file.type))
    return fail('El archivo tiene que ser PDF o imagen');
  const companyId = await getActiveCompanyId();
  const receipt = await prisma.purchase_receipts.findFirst({
    where: { id, company_id: companyId },
    select: { supplier_id: true },
  });
  if (!receipt) return fail('La recepción no existe');

  const path = `${companyId}/${receipt.supplier_id}/receipts/${Date.now()}-${safeFileName(file.name)}`;
  const uploaded = await storageUpload(SUPPLIER_FILES_BUCKET, path, file);
  if (!uploaded.ok) return fail('No se pudo subir el archivo. Intentá de nuevo.');
  try {
    await prisma.purchase_receipts.update({
      where: { id },
      data: { attachment_path: path, attachment_name: file.name },
    });
    revalidate();
    return ok(null);
  } catch (error) {
    await storageRemove(SUPPLIER_FILES_BUCKET, [path]);
    return toPurchaseActionError(error, logger, 'guardar el remito');
  }
}

/**
 * Anula una recepcion: anula su entrada a Almacenes (el motor rechaza si ese stock ya salio),
 * anula la OC complementaria si todavia no se aprobo, y recalcula la OC y las solicitudes.
 */
export async function cancelPurchaseReceipt(id: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'recepciones', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La recepción no existe');
  const motive = requiredReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();

  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const receipt = await lockPurchaseReceipt(tx, companyId, id);
        await lockOrderRow(tx, receipt.orderId);
        // Las complementarias se lockean ACA, antes que las solicitudes: mismo orden que el resto
        // (OC -> solicitudes) y nadie puede aprobarlas o editarlas mientras se anula. Se anulan
        // en cualquier estado (tambien aprobadas): existen solo por esta recepcion y su stock sale
        // con la anulacion.
        const complements = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM purchase_orders
          WHERE complements_receipt_id = ${receipt.id}::uuid AND status <> 'CANCELLED'
          ORDER BY id
          FOR UPDATE
        `;

        if (receipt.stockMovementId) {
          const movementLines = await tx.stock_movement_lines.findMany({
            where: { movement_id: receipt.stockMovementId },
            select: { material_id: true },
          });
          if (
            await hasTireMaterials(
              tx,
              movementLines.map((line) => line.material_id)
            )
          ) {
            throw new PurchaseError('Las recepciones con cubiertas no se anulan: se corrigen desde Gomería');
          }
        }

        // Facturado vs recibido: si la anulacion dejaria facturas vigentes sin respaldo, se bloquea
        // antes de revertir nada (todo corre en esta transaccion, con la OC ya lockeada).
        await assertReceiptCancellationKeepsInvoicesCovered(
          tx,
          receipt.id,
          complements.map((c) => c.id)
        );

        // Solicitudes de la OC y de las complementarias, antes del motor (orden de locks).
        const lines = await tx.purchase_order_lines.findMany({
          where: { OR: [{ order_id: receipt.orderId }, { order_id: { in: complements.map((c) => c.id) } }] },
          select: { request_line_id: true },
        });
        const locked = await lockRequestsForLines(
          tx,
          companyId,
          lines.map((line) => line.request_line_id)
        );

        const now = new Date();
        if (complements.length > 0) {
          await tx.purchase_orders.updateMany({
            where: { id: { in: complements.map((c) => c.id) } },
            data: {
              status: 'CANCELLED',
              cancelled_by: profile.id,
              cancelled_at: now,
              cancel_reason: `Se anuló la recepción ${receipt.number}: ${motive.data}`,
            },
          });
        }

        const reversal = receipt.stockMovementId
          ? await reverseStockMovement(
              tx,
              companyId,
              profile.id,
              receipt.stockMovementId,
              `Anulación de ${receipt.number}: ${motive.data}`
            )
          : null;

        await tx.purchase_receipts.update({
          where: { id: receipt.id },
          data: {
            cancelled_by: profile.id,
            cancelled_at: now,
            cancel_reason: motive.data,
            reversal_movement_id: reversal?.id ?? null,
          },
        });

        await recomputeOrderReceiptStatus(tx, receipt.orderId);
        await recomputeRequestProgress(tx, [...new Set([...locked.values()].map((line) => line.requestId))]);
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'anular la recepción');
  }
}

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

const userName = (p: { fullname: string | null; email: string | null } | null) =>
  p ? p.fullname ?? p.email ?? 'Usuario' : null;

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
