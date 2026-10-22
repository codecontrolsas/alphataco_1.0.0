'use server';

import { QUANTITY_SCALE, formatScaled, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { sendSupplierDocumentEmail } from '@/shared/lib/mail/templates/purchases';
import { toPdfDownload } from '@/shared/lib/pdf/react-pdf.server';
import type { PdfDownload } from '@/shared/lib/pdf/types';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { revalidatePath } from 'next/cache';
import {
  NO_PERMISSION,
  PURCHASES_PATH,
  SESSION_EXPIRED,
  firstIssue,
  toPurchaseActionError,
} from '../lib/action-errors';
import { notifyOrderDecision, notifyOrderSubmitted } from '../lib/approval-notifications.server';
import { lockRequestsForLines, orderedByLine, recomputeRequestProgress, remainingOf } from '../lib/order-progress';
import { canApplyPurchaseOrderAction, purchaseOrderStatusAfter } from '../lib/order-state-machine';
import {
  inputFromStoredOrder,
  insertPurchaseOrder,
  isComplementOrder,
  quoteIdOf,
  requestIdsOfOrder,
  updateComplementDraft,
  writeOrderLines,
} from '../lib/order-writes';
import { lockPurchaseOrder, validatePurchaseOrderInput } from '../lib/orders';
import { NO_PRICES_PERMISSION } from '../lib/price-visibility';
import { canViewPurchasePrices } from '../lib/price-visibility.server';
import { PurchaseError } from '../lib/purchase-errors';
import { lockPurchaseQuote } from '../lib/quotes';
import { ORDERABLE_REQUEST_STATUSES, type PurchaseRequestStatus } from '../lib/request-state-machine';
import { dateColumn } from '../lib/requests';
import { mailNotSentMessage } from '../lib/supplier-send';
import { renderPurchaseOrderPdf } from '../pdf/render-purchase-pdf.server';
import {
  purchaseOrderFormSchema,
  toPurchaseOrderInput,
  type PurchaseOrderFormValues,
  type PurchaseOrderInput,
} from '../schemas/orders';
import { requiredReasonSchema } from '../schemas/requests';
import { sendDocumentSchema, type SendDocumentValues } from '../schemas/send';

const logger = new Logger('features/Purchases/orders');

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** La OC toca solicitudes y cotizaciones: se revalida todo el modulo. */
function revalidate() {
  revalidatePath(PURCHASES_PATH, 'layout');
}

/** Crea una OC directa (lineas de una o varias solicitudes), como borrador o pendiente de aprobacion. */
export async function createPurchaseOrder(
  values: PurchaseOrderFormValues,
  options: { submit: boolean }
): Promise<ActionResult<{ id: string; number: string }>> {
  if (!(await checkPermissionServer('compras', 'ordenes', 'create'))) return fail(NO_PERMISSION);
  // Enviar a aprobacion es del permiso Editar (spec §3), tambien desde el alta.
  if (options.submit && !(await checkPermissionServer('compras', 'ordenes', 'update'))) return fail(NO_PERMISSION);
  const parsed = purchaseOrderFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();

  try {
    const created = await prisma.$transaction((tx) =>
      insertPurchaseOrder(tx, companyId, profile.id, toPurchaseOrderInput(parsed.data), { submit: options.submit })
    );
    logger.info('Orden de compra creada', { data: { number: created.number, submit: options.submit } });
    // «Crear y enviar» la deja esperando aprobación sin pasar por `submitPurchaseOrder`: también avisa.
    if (options.submit) await notifyOrderSubmitted(created.id, companyId, new Date());
    revalidate();
    return ok(created);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'crear la orden de compra');
  }
}

/**
 * Borrador de OC desde una cotizacion respondida: copia las lineas con precio por lo que FALTA de
 * cada linea de solicitud (como mucho, lo cotizado). Omite las ya pedidas completas.
 */
export async function createPurchaseOrderFromQuote(
  quoteId: string
): Promise<ActionResult<{ id: string; number: string; skipped: number }>> {
  if (!(await checkPermissionServer('compras', 'ordenes', 'create'))) return fail(NO_PERMISSION);
  if (!isUuid(quoteId)) return fail('La cotización no existe');
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const quote = await lockPurchaseQuote(tx, companyId, quoteId, 'order');
      const priced = await tx.purchase_quote_lines.findMany({
        where: { quote_id: quote.id, not_quoted: false, unit_price: { not: null } },
        select: { id: true, request_line_id: true, quantity: true, unit_price: true, vat_rate_id: true },
      });
      const locked = await lockRequestsForLines(
        tx,
        companyId,
        priced.map((line) => line.request_line_id)
      );
      const ordered = await orderedByLine(
        tx,
        priced.map((line) => line.request_line_id)
      );
      const orderable: readonly PurchaseRequestStatus[] = ORDERABLE_REQUEST_STATUSES;

      const lines: PurchaseOrderInput['lines'] = [];
      for (const line of priced) {
        const requestLine = locked.get(line.request_line_id);
        if (!requestLine || !orderable.includes(requestLine.requestStatus)) continue;
        const remaining =
          parseScaled(remainingOf(requestLine.requested, ordered.get(line.request_line_id) ?? '0'), QUANTITY_SCALE) ??
          BigInt(0);
        const quoted = parseScaled(line.quantity.toString(), QUANTITY_SCALE) ?? BigInt(0);
        const quantity = remaining < quoted ? remaining : quoted;
        if (quantity <= BigInt(0)) continue;
        lines.push({
          requestLineId: line.request_line_id,
          quoteLineId: line.id,
          quantity: formatScaled(quantity, QUANTITY_SCALE),
          unitPrice: line.unit_price!.toString(),
          vatRateId: line.vat_rate_id!,
        });
      }
      if (lines.length === 0) throw new PurchaseError('No queda nada por pedir de esta cotización');

      const order = await insertPurchaseOrder(
        tx,
        companyId,
        profile.id,
        {
          supplierId: quote.supplierId,
          deliveryDate: null,
          deliveryPlace: null,
          paymentTermDays: null,
          notes: null,
          lines,
        },
        { submit: false, quoteId: quote.id }
      );
      return { ...order, skipped: priced.length - lines.length };
    });
    logger.info('Orden de compra creada desde cotización', { data: { number: created.number, quoteId } });
    revalidate();
    return ok(created);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'generar la orden de compra');
  }
}

/** Edita un borrador: reescribe las lineas y recalcula el avance de las solicitudes viejas y nuevas. */
export async function updatePurchaseOrderDraft(id: string, values: PurchaseOrderFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'ordenes', 'update'))) return fail(NO_PERMISSION);
  // El formulario de edición carga los precios del borrador: editar exige verlos.
  if (!(await canViewPurchasePrices('ordenes'))) return fail(NO_PRICES_PERMISSION);
  if (!isUuid(id)) return fail('La orden de compra no existe');
  const parsed = purchaseOrderFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();

  try {
    await prisma.$transaction(async (tx) => {
      await lockPurchaseOrder(tx, companyId, id, 'edit');
      const previousRequestIds = await requestIdsOfOrder(tx, id);
      const input = toPurchaseOrderInput(parsed.data);
      // Se lockean JUNTAS, en orden por id, las solicitudes que el borrador deja y las que suma:
      // lockear solo las nuevas y despues recalcular las viejas permitia leer un avance viejo y
      // cruzar locks con otra edicion (deadlock).
      const previousLines = await tx.purchase_order_lines.findMany({
        where: { order_id: id },
        select: { request_line_id: true },
      });
      await lockRequestsForLines(tx, companyId, [
        ...previousLines.map((line) => line.request_line_id),
        ...input.lines.map((line) => line.requestLineId),
      ]);
      const complement = await isComplementOrder(tx, id);
      if (complement) {
        await updateComplementDraft(tx, id, input);
        return;
      }
      const validated = await validatePurchaseOrderInput(tx, companyId, input, { orderId: id, complement });
      await tx.purchase_order_lines.deleteMany({ where: { order_id: id } });
      await writeOrderLines(tx, id, validated.lines);
      await tx.purchase_orders.update({
        where: { id },
        data: {
          supplier_id: validated.supplier.id,
          quote_id: await quoteIdOf(tx, validated.lines),
          delivery_date: dateColumn(input.deliveryDate),
          delivery_place: input.deliveryPlace,
          // Vacio: el de la ficha del proveedor (igual que en el alta).
          payment_term_days: input.paymentTermDays ?? validated.supplier.paymentTermDays,
          notes: input.notes,
          subtotal: new Prisma.Decimal(validated.totals.subtotal),
          vat_total: new Prisma.Decimal(validated.totals.vatTotal),
          total: new Prisma.Decimal(validated.totals.total),
        },
      });
      await recomputeRequestProgress(tx, [...previousRequestIds, ...validated.requestIds]);
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'guardar la orden de compra');
  }
}

/** Envia el borrador a aprobacion, revalidando todo (proveedor, faltantes, estado de las solicitudes). */
export async function submitPurchaseOrder(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'ordenes', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La orden de compra no existe');
  const companyId = await getActiveCompanyId();
  const submittedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await lockPurchaseOrder(tx, companyId, id, 'submit');
      await validatePurchaseOrderInput(tx, companyId, await inputFromStoredOrder(tx, id), {
        orderId: id,
        complement: await isComplementOrder(tx, id),
      });
      await tx.purchase_orders.update({
        where: { id },
        data: { status: purchaseOrderStatusAfter('submit'), submitted_at: submittedAt },
      });
    });
    await notifyOrderSubmitted(id, companyId, submittedAt);
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'enviar la orden a aprobación');
  }
}

export async function approvePurchaseOrder(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'ordenes', 'approve'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La orden de compra no existe');
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const decidedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await lockPurchaseOrder(tx, companyId, id, 'approve');
      // Una complementaria regulariza un excedente que ya llego: aprobada, queda recibida.
      const complement = await isComplementOrder(tx, id);
      await tx.purchase_orders.update({
        where: { id },
        data: {
          status: complement ? 'RECEIVED' : purchaseOrderStatusAfter('approve'),
          approved_by: profile.id,
          approved_at: decidedAt,
          rejection_notes: null,
        },
      });
    });
  } catch (error) {
    return toPurchaseActionError(error, logger, 'aprobar la orden de compra');
  }
  await notifyOrderDecision(id, companyId, true, null, decidedAt);
  revalidate();
  return ok(null);
}

/** Rechazar devuelve la OC a borrador con el motivo; cada rechazo queda en el historial. */
export async function rejectPurchaseOrder(id: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'ordenes', 'approve'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La orden de compra no existe');
  const motive = requiredReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await lockPurchaseOrder(tx, companyId, id, 'reject');
      await tx.purchase_orders.update({
        where: { id },
        data: {
          status: purchaseOrderStatusAfter('reject'),
          rejection_notes: motive.data,
          rejected_by: profile.id,
          rejected_at: now,
        },
      });
      await tx.purchase_order_rejections.create({
        data: { order_id: id, rejected_by: profile.id, rejected_at: now, reason: motive.data },
      });
    });
  } catch (error) {
    return toPurchaseActionError(error, logger, 'rechazar la orden de compra');
  }
  await notifyOrderDecision(id, companyId, false, motive.data, now);
  revalidate();
  return ok(null);
}

/** Anula la OC (con motivo) y libera lo que pedia: las solicitudes vuelven a tener faltante. */
export async function cancelPurchaseOrder(id: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'ordenes', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La orden de compra no existe');
  const motive = requiredReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await prisma.$transaction(async (tx) => {
      // Lock primero: una recepcion que se confirma en paralelo ya esta visible al contar.
      // El error de estado se difiere: con recepciones vigentes el motivo útil es "cerrala".
      let stateError: unknown = null;
      try {
        await lockPurchaseOrder(tx, companyId, id, 'cancel');
      } catch (error) {
        stateError = error;
      }
      // Con recepciones vigentes no se anula (en cualquier estado): se cierra.
      const receipts = await tx.purchase_receipts.count({
        where: { order_id: id, cancelled_at: null, company_id: companyId },
      });
      if (stateError && receipts === 0) throw stateError;
      if (receipts > 0) {
        const current = await tx.purchase_orders.findUniqueOrThrow({ where: { id }, select: { number: true } });
        throw new PurchaseError(
          `La orden ${current.number} tiene recepciones: no se puede anular. Si no va a llegar lo que falta, cerrala.`
        );
      }
      const requestIds = await requestIdsOfOrder(tx, id);
      // Mismo orden de locks que al crear: primero las solicitudes, despues se escribe.
      await lockRequestsForLines(
        tx,
        companyId,
        (await tx.purchase_order_lines.findMany({ where: { order_id: id }, select: { request_line_id: true } })).map(
          (line) => line.request_line_id
        )
      );
      await tx.purchase_orders.update({
        where: { id },
        data: {
          status: purchaseOrderStatusAfter('cancel'),
          cancelled_by: profile.id,
          cancelled_at: new Date(),
          cancel_reason: motive.data,
        },
      });
      await recomputeRequestProgress(tx, requestIds);
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'anular la orden de compra');
  }
}

/**
 * Cierra una OC enviada o recibida en parte sin recibir lo que falta (con motivo). Desde ahi la OC
 * cuenta solo lo recibido: lo no entregado vuelve a quedar pendiente en sus solicitudes.
 */
export async function closePurchaseOrder(id: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'ordenes', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La orden de compra no existe');
  const motive = requiredReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await prisma.$transaction(async (tx) => {
      await lockPurchaseOrder(tx, companyId, id, 'close');
      const lines = await tx.purchase_order_lines.findMany({
        where: { order_id: id },
        select: { request_line_id: true },
      });
      const locked = await lockRequestsForLines(
        tx,
        companyId,
        lines.map((line) => line.request_line_id)
      );
      await tx.purchase_orders.update({
        where: { id },
        data: {
          status: purchaseOrderStatusAfter('close'),
          closed_by: profile.id,
          closed_at: new Date(),
          close_reason: motive.data,
        },
      });
      await recomputeRequestProgress(tx, [...new Set([...locked.values()].map((line) => line.requestId))]);
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'cerrar la orden de compra');
  }
}

/**
 * Envia la OC aprobada al proveedor con el PDF adjunto. El envio ES la accion: solo si el mail
 * salio queda ENVIADA. El lock NO cruza el SMTP (una transaccion abierta esperando al servidor de
 * correo bloquearia la OC): se valida, se envia y recien despues se escribe, revalidando el estado.
 */
export async function sendPurchaseOrder(id: string, values: SendDocumentValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'ordenes', 'send'))) return fail(NO_PERMISSION);
  // Se manda el PDF con los importes: quien lo envía tiene que poder verlos.
  if (!(await canViewPurchasePrices('ordenes'))) return fail(NO_PRICES_PERMISSION);
  if (!isUuid(id)) return fail('La orden de compra no existe');
  const parsed = sendDocumentSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();

  try {
    const order = await prisma.purchase_orders.findFirst({
      where: { id, company_id: companyId },
      select: {
        number: true,
        status: true,
        company: { select: { company_name: true } },
        supplier: { select: { name: true } },
      },
    });
    if (!order) return fail('La orden de compra no existe');
    if (!canApplyPurchaseOrderAction(order.status, 'send')) {
      return fail(`La orden ${order.number} no está aprobada: no se puede enviar`);
    }

    const pdf = await renderPurchaseOrderPdf(id, companyId);
    const sent = await sendSupplierDocumentEmail({
      kind: 'order',
      to: parsed.data.to,
      number: order.number,
      companyName: order.company.company_name,
      supplierName: order.supplier.name,
      message: parsed.data.message || null,
      attachment: pdf,
    });
    if (!sent) return fail(mailNotSentMessage('la orden sigue aprobada'));

    const marked = await prisma.$transaction(async (tx) => {
      try {
        await lockPurchaseOrder(tx, companyId, id, 'send');
      } catch (error) {
        // Otro usuario la envio o anulo mientras salia el mail: el mail ya salio, no se pisa nada.
        logger.warn('La orden cambio de estado mientras se enviaba el mail', { data: { error, id } });
        return false;
      }
      await tx.purchase_orders.update({
        where: { id },
        data: {
          status: purchaseOrderStatusAfter('send'),
          sent_at: new Date(),
          sent_to: parsed.data.to,
          sent_by: profile.id,
        },
      });
      return true;
    });
    revalidate();
    if (!marked) {
      return fail(
        `El mail salió, pero la orden ${order.number} cambió de estado mientras se enviaba: revisala antes de volver a mandarla.`
      );
    }
    logger.info('Orden de compra enviada al proveedor', { data: { number: order.number, to: parsed.data.to } });
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'enviar la orden de compra');
  }
}

/** Registra que la OC se le hizo llegar al proveedor por otro medio (sin mail). */
export async function markPurchaseOrderSent(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'ordenes', 'send'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La orden de compra no existe');
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await prisma.$transaction(async (tx) => {
      await lockPurchaseOrder(tx, companyId, id, 'markSent');
      await tx.purchase_orders.update({
        where: { id },
        data: { status: purchaseOrderStatusAfter('markSent'), sent_at: new Date(), sent_to: [], sent_by: profile.id },
      });
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'marcar la orden como enviada');
  }
}

/** PDF de la OC en cualquier estado (con marca de agua hasta que se aprueba). */
export async function getPurchaseOrderPdf(id: string): Promise<ActionResult<PdfDownload>> {
  if (!(await checkPermissionServer('compras', 'ordenes', 'view'))) return fail(NO_PERMISSION);
  if (!(await canViewPurchasePrices('ordenes'))) return fail(NO_PRICES_PERMISSION);
  if (!isUuid(id)) return fail('La orden de compra no existe');
  const companyId = await getActiveCompanyId();
  try {
    const pdf = await renderPurchaseOrderPdf(id, companyId);
    return ok(toPdfDownload(pdf));
  } catch (error) {
    return toPurchaseActionError(error, logger, 'generar el PDF');
  }
}
