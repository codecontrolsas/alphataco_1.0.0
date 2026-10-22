'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { sendSupplierDocumentEmail } from '@/shared/lib/mail/templates/purchases';
import { toPdfDownload } from '@/shared/lib/pdf/react-pdf.server';
import type { PdfDownload } from '@/shared/lib/pdf/types';
import { prisma } from '@/shared/lib/prisma';
import { storageRemove, storageUpload } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { NO_PERMISSION, UUID_RE, firstIssue, toPurchaseActionError } from '../lib/action-errors';
import { nextPurchaseDocumentNumber } from '../lib/document-number';
import { assertWithinRemaining, lockRequestsForLines, orderedByLine, remainingOf } from '../lib/order-progress';
import { NO_PRICES_PERMISSION } from '../lib/price-visibility';
import { canViewPurchasePrices } from '../lib/price-visibility.server';
import { PurchaseError } from '../lib/purchase-errors';
import { canApplyPurchaseQuoteAction } from '../lib/quote-state-machine';
import { lockPurchaseQuote, quoteHasOrders } from '../lib/quotes';
import { ORDERABLE_REQUEST_STATUSES, type PurchaseRequestStatus } from '../lib/request-state-machine';
import { dateColumn } from '../lib/requests';
import { SUPPLIER_FILES_BUCKET, safeFileName } from '../lib/storage-files';
import { mailNotSentMessage } from '../lib/supplier-send';
import { renderPurchaseQuotePdf } from '../pdf/render-purchase-pdf.server';
import {
  QUOTE_ATTACHMENT_MAX_BYTES,
  QUOTE_ATTACHMENT_TYPES,
  normalizePrice,
  purchaseQuoteFormSchema,
  quoteResponseSchema,
  requestQuotesSchema,
  type PurchaseQuoteFormValues,
  type QuoteResponseValues,
  type RequestQuotesValues,
} from '../schemas/quotes';
import { requiredReasonSchema } from '../schemas/requests';
import { sendDocumentSchema, type SendDocumentValues } from '../schemas/send';

const logger = new Logger('features/Purchases/quotes');

const PURCHASES_PATH = '/dashboard/purchases';
const SESSION_EXPIRED = 'Tu sesión expiró. Volvé a ingresar.';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function revalidate() {
  revalidatePath(PURCHASES_PATH, 'layout');
}

/**
 * Valida las lineas a cotizar (de solicitudes aprobadas o pedidas en parte, con faltante) y
 * devuelve la cantidad a pedir de cada una: lo que FALTA. Lockea las solicitudes.
 */
async function quotableLines(tx: Tx, companyId: string, requestLineIds: readonly string[]) {
  const locked = await lockRequestsForLines(tx, companyId, requestLineIds);
  const orderable: readonly PurchaseRequestStatus[] = ORDERABLE_REQUEST_STATUSES;
  for (const line of locked.values()) {
    if (!orderable.includes(line.requestStatus)) {
      throw new PurchaseError(
        `La solicitud ${line.requestNumber} no está aprobada o ya se pidió: sus líneas no se pueden cotizar`
      );
    }
  }
  const ordered = await orderedByLine(tx, requestLineIds);
  // "No queda nada por pedir" con el mismo mensaje que la OC (cantidad minima: 0,0001).
  assertWithinRemaining(
    requestLineIds.map((requestLineId) => ({ requestLineId, quantity: '0.0001' })),
    locked,
    ordered
  );
  return requestLineIds.map((requestLineId) => {
    const line = locked.get(requestLineId)!;
    return {
      requestLineId,
      quantity: new Prisma.Decimal(remainingOf(line.requested, ordered.get(requestLineId) ?? '0')),
    };
  });
}

async function activeSuppliers(tx: Tx, companyId: string, supplierIds: readonly string[]) {
  const suppliers = await tx.suppliers.findMany({
    where: { id: { in: [...supplierIds] }, company_id: companyId },
    select: { id: true, name: true, is_active: true },
  });
  if (suppliers.length !== supplierIds.length) throw new PurchaseError('Uno de los proveedores no existe');
  const inactive = suppliers.find((supplier) => !supplier.is_active);
  if (inactive) throw new PurchaseError(`El proveedor ${inactive.name} está inactivo`);
  return suppliers;
}

async function insertQuote(
  tx: Tx,
  companyId: string,
  profileId: string,
  supplierId: string,
  lines: { requestLineId: string; quantity: Prisma.Decimal }[],
  notes: string | null
) {
  const number = await nextPurchaseDocumentNumber(tx, companyId, 'quote');
  return tx.purchase_quotes.create({
    data: {
      number,
      supplier_id: supplierId,
      created_by: profileId,
      notes,
      lines: { create: lines.map((line) => ({ request_line_id: line.requestLineId, quantity: line.quantity })) },
    },
    select: { id: true, number: true },
  });
}

/** Desde una solicitud: un pedido de cotizacion (borrador) por proveedor, con lo que falta de cada linea. */
export async function requestQuotes(
  values: RequestQuotesValues
): Promise<ActionResult<{ quotes: { id: string; number: string; supplierName: string }[] }>> {
  if (!(await checkPermissionServer('compras', 'cotizaciones', 'create'))) return fail(NO_PERMISSION);
  const parsed = requestQuotesSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();

  try {
    const quotes = await prisma.$transaction(async (tx) => {
      const lines = await quotableLines(tx, companyId, parsed.data.requestLineIds);
      const suppliers = await activeSuppliers(tx, companyId, parsed.data.supplierIds);
      const created = [];
      for (const supplier of suppliers.sort((a, b) => a.name.localeCompare(b.name))) {
        const quote = await insertQuote(tx, companyId, profile.id, supplier.id, lines, parsed.data.notes || null);
        created.push({ ...quote, supplierName: supplier.name });
      }
      return created;
    });
    logger.info('Pedidos de cotización creados', { data: { numbers: quotes.map((q) => q.number) } });
    revalidate();
    return ok({ quotes });
  } catch (error) {
    return toPurchaseActionError(error, logger, 'crear los pedidos de cotización');
  }
}

/** Alta desde la tab Cotizaciones: un proveedor y lineas de cualquier solicitud con faltante. */
export async function createPurchaseQuote(
  values: PurchaseQuoteFormValues
): Promise<ActionResult<{ id: string; number: string }>> {
  if (!(await checkPermissionServer('compras', 'cotizaciones', 'create'))) return fail(NO_PERMISSION);
  const parsed = purchaseQuoteFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const lines = await quotableLines(tx, companyId, parsed.data.requestLineIds);
      await activeSuppliers(tx, companyId, [parsed.data.supplierId]);
      return insertQuote(tx, companyId, profile.id, parsed.data.supplierId, lines, parsed.data.notes || null);
    });
    revalidate();
    return ok(created);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'crear el pedido de cotización');
  }
}

/** Edita un borrador: proveedor, lineas (con lo que falta hoy) y notas. */
export async function updatePurchaseQuoteDraft(id: string, values: PurchaseQuoteFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'cotizaciones', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail('La cotización no existe');
  const parsed = purchaseQuoteFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();

  try {
    await prisma.$transaction(async (tx) => {
      await lockPurchaseQuote(tx, companyId, id, 'edit');
      const lines = await quotableLines(tx, companyId, parsed.data.requestLineIds);
      await activeSuppliers(tx, companyId, [parsed.data.supplierId]);
      await tx.purchase_quote_lines.deleteMany({ where: { quote_id: id } });
      await tx.purchase_quotes.update({
        where: { id },
        data: {
          supplier_id: parsed.data.supplierId,
          notes: parsed.data.notes || null,
          lines: { create: lines.map((line) => ({ request_line_id: line.requestLineId, quantity: line.quantity })) },
        },
      });
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'guardar el pedido de cotización');
  }
}

/**
 * Envia el pedido de cotizacion por mail con el PDF. Mismo esquema que el envio de la OC: el lock
 * no cruza el SMTP; solo si el mail salio queda ENVIADO.
 */
export async function sendPurchaseQuote(id: string, values: SendDocumentValues): Promise<ActionResult> {
  // El pedido de cotización no lleva importes: enviarlo exige `send`, no `view_prices`.
  if (!(await checkPermissionServer('compras', 'cotizaciones', 'send'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail('La cotización no existe');
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
  if (!UUID_RE.test(id)) return fail('La cotización no existe');
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

/** Carga (o corrige, si todavia no tiene OC) la respuesta del proveedor. */
export async function recordPurchaseQuoteResponse(id: string, values: QuoteResponseValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'cotizaciones', 'update'))) return fail(NO_PERMISSION);
  // Cargar o corregir la respuesta muestra los precios cotizados: exige verlos.
  if (!(await canViewPurchasePrices('cotizaciones'))) return fail(NO_PRICES_PERMISSION);
  if (!UUID_RE.test(id)) return fail('La cotización no existe');
  const parsed = quoteResponseSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();

  try {
    await prisma.$transaction(async (tx) => {
      const quote = await lockPurchaseQuote(tx, companyId, id, 'receive');
      if (quote.status === 'RECEIVED' && (await quoteHasOrders(tx, id))) {
        throw new PurchaseError('La cotización ya tiene una orden de compra: no se puede corregir');
      }
      const current = await tx.purchase_quote_lines.findMany({ where: { quote_id: id }, select: { id: true } });
      const currentIds = new Set(current.map((line) => line.id));
      const sentIds = new Set(parsed.data.lines.map((line) => line.lineId));
      if (sentIds.size !== currentIds.size || [...sentIds].some((lineId) => !currentIds.has(lineId))) {
        throw new PurchaseError('Las líneas no corresponden a la cotización: recargá la página');
      }
      for (const line of parsed.data.lines) {
        await tx.purchase_quote_lines.update({
          where: { id: line.lineId },
          data: line.notQuoted
            ? { not_quoted: true, unit_price: null, vat_rate_id: null }
            : {
                not_quoted: false,
                unit_price: new Prisma.Decimal(normalizePrice(line.unitPrice)),
                vat_rate_id: line.vatRateId,
              },
        });
      }
      await tx.purchase_quotes.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          received_at: dateColumn(parsed.data.receivedAt),
          valid_until: dateColumn(parsed.data.validUntil || null),
          delivery_days: parsed.data.deliveryDays ? Number(parsed.data.deliveryDays) : null,
          supplier_notes: parsed.data.supplierNotes || null,
        },
      });
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'guardar la respuesta');
  }
}

/** Adjunta el presupuesto del proveedor. El archivo anterior no se borra (queda en el storage). */
export async function uploadPurchaseQuoteAttachment(id: string, formData: FormData): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'cotizaciones', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail('La cotización no existe');
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return fail('Elegí el archivo');
  if (file.size > QUOTE_ATTACHMENT_MAX_BYTES) return fail('El archivo supera los 10 MB');
  if (!(QUOTE_ATTACHMENT_TYPES as readonly string[]).includes(file.type))
    return fail('El archivo tiene que ser PDF o imagen');
  const companyId = await getActiveCompanyId();
  const quote = await prisma.purchase_quotes.findFirst({
    where: { id, company_id: companyId },
    select: { supplier_id: true, status: true },
  });
  if (!quote) return fail('La cotización no existe');
  if (quote.status === 'CANCELLED') return fail('La cotización está anulada');

  const path = `${companyId}/${quote.supplier_id}/quotes/${Date.now()}-${safeFileName(file.name)}`;
  const uploaded = await storageUpload(SUPPLIER_FILES_BUCKET, path, file);
  if (!uploaded.ok) return fail('No se pudo subir el archivo. Intentá de nuevo.');
  try {
    await prisma.purchase_quotes.update({ where: { id }, data: { attachment_path: path, attachment_name: file.name } });
    revalidate();
    return ok(null);
  } catch (error) {
    await storageRemove(SUPPLIER_FILES_BUCKET, [path]);
    return toPurchaseActionError(error, logger, 'guardar el adjunto');
  }
}

export async function declinePurchaseQuote(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'cotizaciones', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail('La cotización no existe');
  const companyId = await getActiveCompanyId();
  try {
    await prisma.$transaction(async (tx) => {
      await lockPurchaseQuote(tx, companyId, id, 'decline');
      await tx.purchase_quotes.update({
        where: { id },
        data: { status: 'DECLINED', received_at: dateColumn(argentinaDate()) },
      });
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'marcar la cotización');
  }
}

export async function cancelPurchaseQuote(id: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('compras', 'cotizaciones', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail('La cotización no existe');
  const motive = requiredReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await prisma.$transaction(async (tx) => {
      await lockPurchaseQuote(tx, companyId, id, 'cancel');
      await tx.purchase_quotes.update({
        where: { id },
        data: { status: 'CANCELLED', cancelled_by: profile.id, cancelled_at: new Date(), cancel_reason: motive.data },
      });
    });
    revalidate();
    return ok(null);
  } catch (error) {
    return toPurchaseActionError(error, logger, 'anular la cotización');
  }
}

export async function getPurchaseQuotePdf(id: string): Promise<ActionResult<PdfDownload>> {
  if (!(await checkPermissionServer('compras', 'cotizaciones', 'view'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail('La cotización no existe');
  const companyId = await getActiveCompanyId();
  try {
    const pdf = await renderPurchaseQuotePdf(id, companyId);
    return ok(toPdfDownload(pdf));
  } catch (error) {
    return toPurchaseActionError(error, logger, 'generar el PDF');
  }
}
