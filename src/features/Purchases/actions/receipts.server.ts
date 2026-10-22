'use server';

import { QUANTITY_SCALE, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { registerStockMovement, reverseStockMovement } from '@/features/Warehouses/lib/stock-engine';
import { hasTireMaterials, linkTiresFromEntry } from '@/features/Warehouses/lib/tire-stock';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { storageRemove, storageUpload } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { revalidatePath } from 'next/cache';
import {
  NO_PERMISSION,
  PURCHASES_PATH,
  SESSION_EXPIRED,
  TRANSACTION_OPTIONS,
  firstIssue,
  toPurchaseActionError,
} from '../lib/action-errors';
import { nextPurchaseDocumentNumber } from '../lib/document-number';
import { assertReceiptCancellationKeepsInvoicesCovered } from '../lib/invoices';
import { lockRequestsForLines, recomputeRequestProgress, remainingOf } from '../lib/order-progress';
import { computeOrderLine, computeOrderTotals } from '../lib/order-totals';
import { lockPurchaseOrder, receivedByOrderLine, recomputeOrderReceiptStatus } from '../lib/orders';
import { PurchaseError } from '../lib/purchase-errors';
import { splitReceived } from '../lib/receipt-math';
import { ORDER_LINE_SELECT } from '../lib/receipt-order-lines';
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

function revalidate() {
  revalidatePath(PURCHASES_PATH, 'layout');
  revalidatePath('/dashboard/warehouse', 'layout');
}

const ZERO = BigInt(0);
const scaled = (value: string) => parseScaled(value, QUANTITY_SCALE) ?? ZERO;

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
