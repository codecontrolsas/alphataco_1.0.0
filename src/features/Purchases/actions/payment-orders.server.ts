'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { sendSupplierDocumentEmail } from '@/shared/lib/mail/templates/purchases';
import { toPdfDownload } from '@/shared/lib/pdf/react-pdf.server';
import type { PdfDownload } from '@/shared/lib/pdf/types';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import {
  NO_PERMISSION,
  SESSION_EXPIRED,
  TRANSACTION_OPTIONS,
  firstIssue,
  toPurchaseActionError,
} from '../lib/action-errors';
import { nextPurchaseDocumentNumber } from '../lib/document-number';
import { NOT_FOUND, canEditOrders, day, revalidate } from '../lib/payment-action-helpers';
import { lockPaymentOrder, lockSupplier } from '../lib/payment-locks';
import { canApplyPaymentOrderAction } from '../lib/payment-order-state-machine';
import { assertPaymentOrderStillValid, assertWithholdingsStillValid } from '../lib/payment-revalidation';
import { type PaymentTotals } from '../lib/payment-totals';
import { buildPaymentOrder, paymentOrderData, type BuiltWithholding } from '../lib/payments';
import { PurchaseError } from '../lib/purchase-errors';
import { mailNotSentMessage } from '../lib/supplier-send';
import { renderPaymentOrderPdf } from '../pdf/render-payment-pdf.server';
import { paymentOrderFormSchema, type PaymentOrderFormValues } from '../schemas/payment-orders';
import { requiredReasonSchema } from '../schemas/requests';
import { sendDocumentSchema, type SendDocumentValues } from '../schemas/send';

const logger = new Logger('features/Purchases/payment-orders');

/** Vista previa del formulario: totales y retenciones sin guardar (con el proveedor lockeado en una tx de lectura). */
export async function previewPaymentOrder(
  values: PaymentOrderFormValues,
  options: { orderId?: string } = {}
): Promise<ActionResult<{ totals: PaymentTotals; withholdings: BuiltWithholding[] }>> {
  if (!(await canEditOrders())) return fail(NO_PERMISSION);
  const parsed = paymentOrderFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  try {
    const built = await prisma.$transaction(async (tx) => {
      const supplier = await lockSupplier(tx, companyId, parsed.data.supplierId);
      return buildPaymentOrder(tx, companyId, supplier, parsed.data, {
        orderId: options.orderId && isUuid(options.orderId) ? options.orderId : undefined,
      });
    });
    return ok({ totals: built.totals, withholdings: built.withholdings });
  } catch (error) {
    return toPurchaseActionError(error, logger, 'calcular la orden de pago');
  }
}

/** Arma una orden de pago en borrador (spec Compras etapa 5 §3.1). */
export async function createPaymentOrder(
  values: PaymentOrderFormValues
): Promise<ActionResult<{ id: string; number: string }>> {
  if (!(await checkPermissionServer('compras', 'pagos', 'create'))) return fail(NO_PERMISSION);
  const parsed = paymentOrderFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    const result = await withActor(
      profile.credentialId,
      async (tx) => {
        const supplier = await lockSupplier(tx, companyId, parsed.data.supplierId);
        if (!supplier.isActive) throw new PurchaseError(`El proveedor ${supplier.name} está inactivo`);
        const built = await buildPaymentOrder(tx, companyId, supplier, parsed.data);
        const data = paymentOrderData(built);
        const number = await nextPurchaseDocumentNumber(tx, companyId, 'payment');
        return tx.payment_orders.create({
          data: {
            number,
            supplier_id: supplier.id,
            status: 'DRAFT',
            planned_on: day(parsed.data.plannedOn),
            notes: parsed.data.notes || null,
            created_by: profile.id,
            ...data.header,
            lines: { create: data.lines },
            withholdings: { create: data.withholdings },
          },
          select: { id: true, number: true },
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidate();
    return ok(result);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'armar la orden de pago');
  }
}

/** Edita un borrador: reemplaza lineas y retenciones. */
export async function updatePaymentOrder(id: string, values: PaymentOrderFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail(NOT_FOUND);
  const parsed = paymentOrderFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const order = await lockPaymentOrder(tx, companyId, id, 'edit');
        if (order.supplierId !== parsed.data.supplierId)
          throw new PurchaseError('El proveedor de una orden de pago no se cambia: armá otra');
        const built = await buildPaymentOrder(tx, companyId, order.supplier, parsed.data, { orderId: id });
        const data = paymentOrderData(built);
        await tx.payment_order_lines.deleteMany({ where: { payment_order_id: id } });
        await tx.payment_order_withholdings.deleteMany({ where: { payment_order_id: id } });
        await tx.payment_orders.update({
          where: { id },
          data: {
            planned_on: day(parsed.data.plannedOn),
            notes: parsed.data.notes || null,
            ...data.header,
            lines: { create: data.lines },
            withholdings: { create: data.withholdings },
          },
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'editar la orden de pago');
  }
}

export async function submitPaymentOrder(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail(NOT_FOUND);
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(profile.credentialId, async (tx) => {
      await lockPaymentOrder(tx, companyId, id, 'submit');
      await tx.payment_orders.update({ where: { id }, data: { status: 'PENDING_APPROVAL', submitted_at: new Date() } });
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'enviar a aprobación la orden de pago');
  }
}

/** Aprueba: congela las retenciones. Vuelve a validar comprobantes y anticipos. */
export async function approvePaymentOrder(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'pagos', 'approve'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail(NOT_FOUND);
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(profile.credentialId, async (tx) => {
      const order = await lockPaymentOrder(tx, companyId, id, 'approve');
      await assertPaymentOrderStillValid(tx, companyId, id);
      await assertWithholdingsStillValid(tx, companyId, order.supplier, id);
      await tx.payment_orders.update({
        where: { id },
        data: { status: 'APPROVED', approved_by: profile.id, approved_at: new Date() },
      });
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'aprobar la orden de pago');
  }
}

export async function rejectPaymentOrder(id: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'pagos', 'approve'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail(NOT_FOUND);
  const motive = requiredReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(profile.credentialId, async (tx) => {
      await lockPaymentOrder(tx, companyId, id, 'reject');
      const now = new Date();
      await tx.payment_orders.update({
        where: { id },
        data: {
          status: 'DRAFT',
          rejected_by: profile.id,
          rejected_at: now,
          rejection_notes: motive.data,
          rejections: { create: { rejected_by: profile.id, rejected_at: now, reason: motive.data } },
        },
      });
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'rechazar la orden de pago');
  }
}

/** Vuelve a borrador (para recalcular o corregir) desde pendiente o aprobada. */
export async function backToDraftPaymentOrder(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'pagos', 'update'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail(NOT_FOUND);
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(profile.credentialId, async (tx) => {
      await lockPaymentOrder(tx, companyId, id, 'backToDraft');
      await tx.payment_orders.update({
        where: { id },
        data: { status: 'DRAFT', approved_by: null, approved_at: null },
      });
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'volver a borrador la orden de pago');
  }
}

/** PDF de la orden de pago con sus certificados (marca de agua si no esta pagada). */
export async function getPaymentOrderPdf(id: string): Promise<ActionResult<PdfDownload>> {
  if (!(await checkPermissionServer('compras', 'pagos', 'view'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail(NOT_FOUND);
  const companyId = await getActiveCompanyId();
  try {
    const pdf = await renderPaymentOrderPdf(id, companyId);
    return ok(toPdfDownload(pdf));
  } catch (error) {
    return toPurchaseActionError(error, logger, 'generar el PDF');
  }
}

/**
 * Envia al proveedor el PDF de la orden pagada con los certificados. No cambia el estado: registra
 * a quien y cuando se envio. El mail sale fuera de la transaccion.
 */
export async function sendPaymentOrder(id: string, values: SendDocumentValues): Promise<ActionResult> {
  // Pagos no tiene `view_prices` (ver la pestaña implica ver importes): enviar exige solo `send`.
  if (!(await checkPermissionServer('compras', 'pagos', 'send'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail(NOT_FOUND);
  const parsed = sendDocumentSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  try {
    const order = await prisma.payment_orders.findFirst({
      where: { id, company_id: companyId },
      select: {
        number: true,
        status: true,
        company: { select: { company_name: true } },
        supplier: { select: { name: true } },
      },
    });
    if (!order) return fail(NOT_FOUND);
    if (!canApplyPaymentOrderAction(order.status, 'send'))
      return fail(`La orden ${order.number} no está pagada: no se envía todavía`);
    const pdf = await renderPaymentOrderPdf(id, companyId);
    const sent = await sendSupplierDocumentEmail({
      kind: 'payment',
      to: parsed.data.to,
      number: order.number,
      companyName: order.company.company_name,
      supplierName: order.supplier.name,
      message: parsed.data.message || null,
      attachment: pdf,
    });
    if (!sent) return fail(mailNotSentMessage('la orden sigue pagada'));
    await prisma.payment_orders.update({ where: { id }, data: { sent_at: new Date(), sent_to: parsed.data.to } });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'enviar la orden de pago');
  }
}
