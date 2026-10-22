import 'server-only';

import { notifySafe } from '@/features/Notifications/lib/dispatch.server';
import { Logger } from '@/lib/logger';
import {
  renderPurchaseApprovalPendingEmail,
  renderPurchaseOrderDecisionEmail,
  renderPurchaseRequestDecisionEmail,
} from '@/shared/lib/mail/templates/purchases';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';

/**
 * Avisos de aprobación de solicitudes y órdenes de compra. Se mandan DESPUÉS de confirmar la operación:
 * un aviso que falla se loguea y nunca rompe lo que ya quedó guardado.
 */
const logger = new Logger('features/Purchases/approval-notifications');

/** Aviso a quienes pueden aprobar (#786), DESPUES de confirmar el envío: si falla, la solicitud igual quedó enviada. */
export async function notifyRequestSubmitted(
  requestId: string,
  companyId: string,
  submittedBy: string | null,
  submittedAt: Date
) {
  try {
    const [request, actorId] = await Promise.all([
      prisma.purchase_requests.findUnique({ where: { id: requestId }, select: { number: true } }),
      getSessionUserId(),
    ]);
    if (!request) return;
    await notifySafe({
      event: 'purchases.request_submitted',
      companyId,
      dedupeKey: `purchases.request_submitted:${requestId}:${submittedAt.toISOString()}`,
      title: `Solicitud ${request.number} para aprobar`,
      body: submittedBy ? `Enviada por ${submittedBy}` : undefined,
      href: `/dashboard/purchases/requests/${requestId}`,
      actorId,
      email: renderPurchaseApprovalPendingEmail({
        kind: 'request',
        number: request.number,
        submittedBy,
        id: requestId,
      }),
    });
  } catch (error) {
    // El aviso nunca rompe la operación que ya quedó guardada.
    logger.error('No se pudo preparar el aviso', { data: { error, requestId } });
  }
}

/** Aviso al solicitante, DESPUES de confirmar la decision: si el aviso falla, la decision queda. */
export async function notifyRequestDecision(
  requestId: string,
  companyId: string,
  approved: boolean,
  notes: string | null,
  decidedAt: Date
) {
  try {
    const request = await prisma.purchase_requests.findUnique({
      where: { id: requestId },
      select: { number: true, requester: { select: { credential_id: true, fullname: true } } },
    });
    const userId = request?.requester.credential_id;
    if (!request || !userId) return;
    const verdict = approved ? 'aprobada' : 'rechazada';
    await notifySafe({
      event: 'purchases.request_decided',
      companyId,
      dedupeKey: `purchases.request_decided:${requestId}:${decidedAt.toISOString()}`,
      title: `Tu solicitud ${request.number} fue ${verdict}`,
      body: notes ?? undefined,
      href: `/dashboard/purchases/requests/${requestId}`,
      userIds: [userId],
      email: renderPurchaseRequestDecisionEmail({
        name: request.requester.fullname,
        number: request.number,
        approved,
        notes,
        requestId,
      }),
    });
  } catch (error) {
    // El aviso nunca rompe la operación que ya quedó guardada.
    logger.error('No se pudo preparar el aviso', { data: { error, requestId } });
  }
}

/** Aviso a quienes pueden aprobar (#786), DESPUES de confirmar el envío: si falla, la OC igual quedó enviada. */
export async function notifyOrderSubmitted(orderId: string, companyId: string, submittedAt: Date) {
  try {
    const [order, actorId] = await Promise.all([
      prisma.purchase_orders.findUnique({
        where: { id: orderId },
        select: { number: true, supplier: { select: { name: true } } },
      }),
      getSessionUserId(),
    ]);
    if (!order) return;
    const sender = actorId
      ? (await prisma.profile.findUnique({ where: { credential_id: actorId }, select: { fullname: true } }))
          ?.fullname ?? null
      : null;
    await notifySafe({
      event: 'purchases.order_submitted',
      companyId,
      dedupeKey: `purchases.order_submitted:${orderId}:${submittedAt.toISOString()}`,
      title: `Orden de compra ${order.number} para aprobar`,
      body: order.supplier?.name ? `Proveedor: ${order.supplier.name}` : undefined,
      href: `/dashboard/purchases/orders/${orderId}`,
      actorId,
      email: renderPurchaseApprovalPendingEmail({
        kind: 'order',
        number: order.number,
        submittedBy: sender,
        id: orderId,
      }),
    });
  } catch (error) {
    // El aviso nunca rompe la operación que ya quedó guardada.
    logger.error('No se pudo preparar el aviso', { data: { error, orderId } });
  }
}

/** Aviso a quien creo la OC, DESPUES de confirmar la decision: si el aviso falla, la decision queda. */
export async function notifyOrderDecision(
  orderId: string,
  companyId: string,
  approved: boolean,
  notes: string | null,
  decidedAt: Date
) {
  try {
    const order = await prisma.purchase_orders.findUnique({
      where: { id: orderId },
      select: { number: true, creator: { select: { credential_id: true, fullname: true } } },
    });
    const userId = order?.creator.credential_id;
    if (!order || !userId) return;
    const verdict = approved ? 'aprobada' : 'rechazada';
    await notifySafe({
      event: 'purchases.order_decided',
      companyId,
      dedupeKey: `purchases.order_decided:${orderId}:${decidedAt.toISOString()}`,
      title: `Tu orden de compra ${order.number} fue ${verdict}`,
      body: notes ?? undefined,
      href: `/dashboard/purchases/orders/${orderId}`,
      userIds: [userId],
      email: renderPurchaseOrderDecisionEmail({
        name: order.creator.fullname,
        number: order.number,
        approved,
        notes,
        orderId,
      }),
    });
  } catch (error) {
    // El aviso nunca rompe la operación que ya quedó guardada.
    logger.error('No se pudo preparar el aviso', { data: { error, orderId } });
  }
}
