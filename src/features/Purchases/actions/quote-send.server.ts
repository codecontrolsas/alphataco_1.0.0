'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { sendSupplierDocumentEmail } from '@/shared/lib/mail/templates/purchases';
import { toPdfDownload } from '@/shared/lib/pdf/react-pdf.server';
import type { PdfDownload } from '@/shared/lib/pdf/types';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { isUuid } from '@/shared/lib/uuid';
import { revalidatePath } from 'next/cache';
import { NO_PERMISSION, PURCHASES_PATH, firstIssue, toPurchaseActionError } from '../lib/action-errors';
import { canApplyPurchaseQuoteAction } from '../lib/quote-state-machine';
import { lockPurchaseQuote } from '../lib/quotes';
import { mailNotSentMessage } from '../lib/supplier-send';
import { renderPurchaseQuotePdf } from '../pdf/render-purchase-pdf.server';
import { sendDocumentSchema, type SendDocumentValues } from '../schemas/send';

const logger = new Logger('features/Purchases/quote-send');

function revalidate() {
  revalidatePath(PURCHASES_PATH, 'layout');
}

/**
 * Envia el pedido de cotizacion por mail con el PDF. Mismo esquema que el envio de la OC: el lock
 * no cruza el SMTP; solo si el mail salio queda ENVIADO.
 */
export async function sendPurchaseQuote(id: string, values: SendDocumentValues): Promise<ActionResult> {
  // El pedido de cotización no lleva importes: enviarlo exige `send`, no `view_prices`.
  if (!(await checkPermissionServer('compras', 'cotizaciones', 'send'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La cotización no existe');
  const parsed = sendDocumentSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();

  try {
    const quote = await prisma.purchase_quotes.findFirst({
      where: { id, company_id: companyId },
      select: {
        number: true,
        status: true,
        company: { select: { company_name: true } },
        supplier: { select: { name: true } },
      },
    });
    if (!quote) return fail('La cotización no existe');
    if (!canApplyPurchaseQuoteAction(quote.status, 'send')) return fail(`La cotización ${quote.number} ya fue enviada`);

    const pdf = await renderPurchaseQuotePdf(id, companyId);
    const sent = await sendSupplierDocumentEmail({
      kind: 'quote',
      to: parsed.data.to,
      number: quote.number,
      companyName: quote.company.company_name,
      supplierName: quote.supplier.name,
      message: parsed.data.message || null,
      attachment: pdf,
    });
    if (!sent) return fail(mailNotSentMessage('la cotización sigue en borrador'));

    const marked = await prisma.$transaction(async (tx) => {
      try {
        await lockPurchaseQuote(tx, companyId, id, 'send');
      } catch (error) {
        logger.warn('La cotización cambió de estado mientras se enviaba el mail', { data: { error, id } });
        return false;
      }
      await tx.purchase_quotes.update({
        where: { id },
        data: { status: 'SENT', sent_at: new Date(), sent_to: parsed.data.to },
      });
      return true;
    });
    revalidate();
    if (!marked) {
      return fail(`El mail salió, pero la cotización ${quote.number} cambió de estado mientras se enviaba: revisala.`);
    }
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'enviar el pedido de cotización');
  }
}

export async function markPurchaseQuoteSent(id: string): Promise<ActionResult> {
  // El pedido de cotización no lleva importes: enviarlo exige `send`, no `view_prices`.
  if (!(await checkPermissionServer('compras', 'cotizaciones', 'send'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La cotización no existe');
  const companyId = await getActiveCompanyId();
  try {
    await prisma.$transaction(async (tx) => {
      await lockPurchaseQuote(tx, companyId, id, 'markSent');
      await tx.purchase_quotes.update({ where: { id }, data: { status: 'SENT', sent_at: new Date(), sent_to: [] } });
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'marcar la cotización como enviada');
  }
}

export async function getPurchaseQuotePdf(id: string): Promise<ActionResult<PdfDownload>> {
  if (!(await checkPermissionServer('compras', 'cotizaciones', 'view'))) return fail(NO_PERMISSION);
  if (!isUuid(id)) return fail('La cotización no existe');
  const companyId = await getActiveCompanyId();
  try {
    const pdf = await renderPurchaseQuotePdf(id, companyId);
    return ok(toPdfDownload(pdf));
  } catch (error) {
    return toPurchaseActionError(error, logger, 'generar el PDF');
  }
}
