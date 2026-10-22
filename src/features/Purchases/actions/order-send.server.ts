'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
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
import { canApplyPurchaseOrderAction, purchaseOrderStatusAfter } from '../lib/order-state-machine';
import { lockPurchaseOrder } from '../lib/orders';
import { NO_PRICES_PERMISSION } from '../lib/price-visibility';
import { canViewPurchasePrices } from '../lib/price-visibility.server';
import { mailNotSentMessage } from '../lib/supplier-send';
import { renderPurchaseOrderPdf } from '../pdf/render-purchase-pdf.server';
import { sendDocumentSchema, type SendDocumentValues } from '../schemas/send';

const logger = new Logger('features/Purchases/order-send');

function revalidate() {
  revalidatePath(PURCHASES_PATH, 'layout');
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
