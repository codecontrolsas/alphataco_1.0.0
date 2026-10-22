'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { NO_PERMISSION, firstIssue } from '@/features/Purchases/lib/action-errors';
import { mailNotSentMessage } from '@/features/Purchases/lib/supplier-send';
import { sendDocumentSchema, type SendDocumentValues } from '@/features/Purchases/schemas/send';
import { UUID_RE } from '@/features/Treasury/schemas/shared';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { sendCustomerReceiptEmail } from '@/shared/lib/mail/templates/treasury';
import { toPdfDownload } from '@/shared/lib/pdf/react-pdf.server';
import type { PdfDownload } from '@/shared/lib/pdf/types';
import { prisma } from '@/shared/lib/prisma';
import { storageRemove } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { toTreasuryActionError } from '../lib/action-errors';
import { CHECK_STATUS_LABELS } from '../lib/check-transitions';
import { createCheck, lockChecks, moveCheck } from '../lib/checks';
import { nextReceiptNumber } from '../lib/document-number';
import { cancelMovements, createMovement } from '../lib/movements';
import { lockReceipt } from '../lib/receipt-locks';
import { closingError, closingGap } from '../lib/receipt-math';
import { receiptPaymentMovementDate } from '../lib/receipt-rules';
import { assertReceiptCustomer, writeReceiptDraft } from '../lib/receipt-writer';
import { CUSTOMER_FILES_BUCKET } from '../lib/storage-files';
import { TreasuryError } from '../lib/treasury-errors';
import { renderCustomerReceiptPdf } from '../pdf/render-receipt-pdf.server';
import { cancelReasonSchema } from '../schemas/movements';
import { receiptFormSchema, type ReceiptFormValues } from '../schemas/receipts';
import { SESSION_EXPIRED, TRANSACTION_OPTIONS, localToday, revalidateTreasury } from './shared';

/**
 * Recibos de cobranza (spec Tesorería etapa 2 §3). Borrador (sin número ni efecto) → confirmado
 * (toma número, mueve las cuentas) → anulado. Un recibo confirmado no se edita: se anula.
 */

const logger = new Logger('features/Treasury/receipts');

const NOT_FOUND = 'El recibo no existe';
const COMMERCIAL_PATH = '/dashboard/comercial/facturacion';

function revalidate() {
  revalidateTreasury();
  revalidatePath(COMMERCIAL_PATH, 'layout');
}

/** Borra de RustFS los certificados de retenciones que ya no existen (después del commit). */
async function removeFiles(paths: string[]) {
  if (paths.length === 0) return;
  const removed = await storageRemove(CUSTOMER_FILES_BUCKET, paths);
  if (!removed.ok) logger.warn('No se pudieron borrar certificados huérfanos', { data: { paths } });
}

/** Estado → mensaje cuando el recibo ya no es un borrador. */
function assertDraft(status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED') {
  if (status === 'CONFIRMED') throw new TreasuryError('El recibo ya fue confirmado');
  if (status === 'CANCELLED') throw new TreasuryError('El recibo está anulado');
}

/** Guarda el borrador (lo crea si `id` es null). No toca saldos ni toma número. */
export async function saveReceiptDraft(
  id: string | null,
  values: ReceiptFormValues
): Promise<ActionResult<{ id: string; withholdingIds: string[] }>> {
  if (!(await checkPermissionServer('tesoreria', 'cobranzas', id ? 'update' : 'create'))) return fail(NO_PERMISSION);
  if (id !== null && !UUID_RE.test(id)) return fail(NOT_FOUND);
  const parsed = receiptFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const v = parsed.data;
  try {
    const saved = await withActor(
      profile.credentialId,
      async (tx) => {
        const { receiptId, requireActive } = await openDraft(tx, companyId, id, v, profile.id);
        const written = await writeReceiptDraft(tx, {
          companyId,
          receiptId,
          requireActiveCustomer: requireActive,
          values: v,
          today: localToday(),
        });
        return { id: receiptId, withholdingIds: written.withholdingIds, removedFiles: written.removedFiles };
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    await removeFiles(saved.removedFiles);
    revalidate();
    return ok({ id: saved.id, withholdingIds: saved.withholdingIds });
  } catch (error) {
    return toTreasuryActionError(error, logger, 'guardar el recibo');
  }
}

type DraftTx = Parameters<Parameters<typeof withActor>[1]>[0];

/** Crea el borrador o toma el existente (FOR UPDATE) verificando que siga en borrador. */
async function openDraft(tx: DraftTx, companyId: string, id: string | null, v: ReceiptFormValues, profileId: string) {
  if (id === null) {
    await assertReceiptCustomer(tx, companyId, v.customerId, true);
    const created = await tx.customer_receipts.create({
      data: {
        customer_id: v.customerId,
        status: 'DRAFT',
        date: new Date(`${v.date}T00:00:00.000Z`),
        created_by: profileId,
      },
      select: { id: true },
    });
    return { receiptId: created.id, requireActive: true };
  }
  const locked = await lockReceipt(tx, companyId, id);
  assertDraft(locked.status);
  return { receiptId: locked.id, requireActive: locked.customerId !== v.customerId };
}

/**
 * Guarda y confirma en una transacción (spec §3.2): recalcula pendientes con los comprobantes
 * bloqueados, exige que cierre, toma el número y crea un movimiento por medio.
 */
export async function confirmReceipt(
  id: string | null,
  values: ReceiptFormValues
): Promise<ActionResult<{ id: string; number: string; withholdingIds: string[] }>> {
  const permissions = await Promise.all([
    checkPermissionServer('tesoreria', 'cobranzas', 'update'),
    id ? Promise.resolve(true) : checkPermissionServer('tesoreria', 'cobranzas', 'create'),
  ]);
  if (!permissions.every(Boolean)) return fail(NO_PERMISSION);
  if (id !== null && !UUID_RE.test(id)) return fail(NOT_FOUND);
  const parsed = receiptFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  const v = parsed.data;
  try {
    const confirmed = await withActor(
      profile.credentialId,
      async (tx) => {
        const { receiptId, requireActive } = await openDraft(tx, companyId, id, v, profile.id);
        const written = await writeReceiptDraft(tx, {
          companyId,
          receiptId,
          requireActiveCustomer: requireActive,
          values: v,
          today: localToday(),
        });
        if (written.lineCount === 0)
          throw new TreasuryError('Cargá al menos un comprobante, un anticipo o un cobro a cuenta');
        const notClosing = closingError(closingGap(written.totals));
        if (notClosing) throw new TreasuryError(notClosing);
        const number = await nextReceiptNumber(tx, companyId);
        for (const p of written.payments) {
          await createMovement(tx, {
            companyId,
            accountId: p.accountId,
            date: receiptPaymentMovementDate(p.method, v.date, p.checkDueOn),
            amountCents: p.amountCents,
            kind: 'CUSTOMER_RECEIPT',
            customerReceiptPaymentId: p.id,
            description: `${number} — ${written.customerName}${p.checkNumber ? ` — Cheque N° ${p.checkNumber}` : ''}`,
            createdBy: profile.id,
          });
          // Cada cheque recibido entra EN CARTERA (etapa 3a); el índice de vigentes rechaza un repetido.
          if (p.check) {
            await createCheck(tx, {
              companyId,
              portfolioId: p.accountId,
              customerId: v.customerId,
              userId: profile.id,
              date: v.date,
              data: { ...p.check, amountCents: p.amountCents },
              origin: { receiptPaymentId: p.id, receiptId },
            });
          }
        }
        await tx.customer_receipts.update({
          where: { id: receiptId },
          data: { status: 'CONFIRMED', number, confirmed_by: profile.id, confirmed_at: new Date() },
        });
        return { id: receiptId, number, withholdingIds: written.withholdingIds, removedFiles: written.removedFiles };
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    await removeFiles(confirmed.removedFiles);
    revalidate();
    return ok({ id: confirmed.id, number: confirmed.number, withholdingIds: confirmed.withholdingIds });
  } catch (error) {
    return toTreasuryActionError(
      error,
      logger,
      'confirmar el recibo',
      'El número de recibo ya está en uso. Intentá de nuevo'
    );
  }
}

/** Borra un borrador (no tiene número ni movimientos) y sus certificados. */
export async function deleteReceiptDraft(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'cobranzas', 'delete'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    const removedFiles = await withActor(
      profile.credentialId,
      async (tx) => {
        const locked = await lockReceipt(tx, companyId, id);
        if (locked.status !== 'DRAFT') throw new TreasuryError('Solo se borra un recibo en borrador: anulalo');
        const files = await tx.customer_receipt_withholdings.findMany({
          where: { receipt_id: id, file_path: { not: null } },
          select: { file_path: true },
        });
        await tx.customer_receipts.delete({ where: { id } });
        return files.map((f) => f.file_path).filter((path): path is string => Boolean(path));
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    await removeFiles(removedFiles);
    revalidate();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'borrar el borrador');
  }
}

/** Anula un recibo confirmado (spec §3.3): anula sus movimientos y libera comprobantes y anticipos. */
export async function cancelReceipt(id: string, reason: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'cobranzas', 'delete'))) return fail(NO_PERMISSION);
  const motive = cancelReasonSchema.safeParse(reason);
  if (!motive.success) return fail(firstIssue(motive.error));
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const profile = await getServerAuthProfile();
  if (!profile) return fail(SESSION_EXPIRED);
  const companyId = await getActiveCompanyId();
  try {
    await withActor(
      profile.credentialId,
      async (tx) => {
        const locked = await lockReceipt(tx, companyId, id);
        if (locked.status === 'DRAFT') throw new TreasuryError('Un borrador no se anula: borralo');
        if (locked.status === 'CANCELLED') throw new TreasuryError('El recibo ya está anulado');
        // Sus anticipos se bloquean igual que al aplicarlos (lockReceivables): quien llega segundo
        // ve lo del primero (la aplicación ya hecha, o el recibo de origen anulado).
        await tx.$queryRaw`SELECT id FROM customer_receipt_lines WHERE receipt_id = ${id}::uuid AND kind = 'ADVANCE' ORDER BY id FOR UPDATE`;
        const applications = await tx.$queryRaw<{ number: string | null; status: string }[]>`
          SELECT xr.number, xr.status::text AS status
          FROM customer_receipt_lines a
          JOIN customer_receipt_lines x ON x.source_line_id = a.id
          JOIN customer_receipts xr ON xr.id = x.receipt_id
          WHERE a.receipt_id = ${id}::uuid AND a.kind = 'ADVANCE' AND xr.status IN ('DRAFT', 'CONFIRMED')
          ORDER BY (xr.status = 'CONFIRMED') DESC
          LIMIT 1
        `;
        const applied = applications[0];
        if (applied?.number)
          throw new TreasuryError(
            `El anticipo de este recibo se aplicó en ${applied.number}: anulá ese recibo primero`
          );
        if (applied)
          throw new TreasuryError(
            'El anticipo de este recibo se aplicó en un recibo en borrador: quitalo de ahí primero'
          );
        // Sus cheques tienen que seguir en la cartera: si alguno salió, primero se anula esa operación.
        const received = await tx.third_party_checks.findMany({
          where: { receipt_payment: { receipt_id: id } },
          select: { id: true },
        });
        const checks = await lockChecks(
          tx,
          companyId,
          received.map((c) => c.id)
        );
        for (const check of checks.values()) {
          if (check.status !== 'IN_PORTFOLIO') {
            throw new TreasuryError(
              `El cheque Nº ${check.number} (${check.bank}) está ${CHECK_STATUS_LABELS[check.status].toLowerCase()}: anulá primero la operación que lo sacó de la cartera`
            );
          }
        }
        const cancel = { by: profile.id, reason: motive.data, at: new Date() };
        await cancelMovements(tx, { customerReceiptId: id }, cancel);
        const today = localToday();
        for (const check of checks.values()) {
          await moveCheck(tx, {
            check,
            action: 'CANCEL_ORIGIN',
            date: today,
            userId: profile.id,
            origin: { receiptId: id },
          });
        }
        await tx.customer_receipts.update({
          where: { id },
          data: { status: 'CANCELLED', cancelled_by: cancel.by, cancelled_at: cancel.at, cancel_reason: cancel.reason },
        });
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    revalidate();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'anular el recibo');
  }
}

/** PDF del recibo (generado a demanda, como el de la orden de pago). */
export async function getReceiptPdf(id: string): Promise<ActionResult<PdfDownload>> {
  if (!(await checkPermissionServer('tesoreria', 'cobranzas', 'view'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const companyId = await getActiveCompanyId();
  try {
    const pdf = await renderCustomerReceiptPdf(id, companyId);
    return ok(toPdfDownload(pdf));
  } catch (error) {
    return toTreasuryActionError(error, logger, 'generar el PDF del recibo');
  }
}

/** Envía el recibo confirmado al cliente. Registra a quién y cuándo solo si el mail salió. */
export async function sendReceipt(id: string, values: SendDocumentValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'cobranzas', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const parsed = sendDocumentSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  try {
    const receipt = await prisma.customer_receipts.findFirst({
      where: { id, company_id: companyId },
      select: {
        number: true,
        status: true,
        company: { select: { company_name: true } },
        customer: { select: { name: true } },
      },
    });
    if (!receipt) return fail(NOT_FOUND);
    if (receipt.status === 'DRAFT' || !receipt.number) return fail('El recibo no está confirmado');
    if (receipt.status === 'CANCELLED') return fail('El recibo está anulado: no se envía');
    const pdf = await renderCustomerReceiptPdf(id, companyId);
    const sent = await sendCustomerReceiptEmail({
      to: parsed.data.to,
      number: receipt.number,
      companyName: receipt.company.company_name,
      customerName: receipt.customer.name,
      message: parsed.data.message || null,
      attachment: pdf,
    });
    if (!sent) return fail(mailNotSentMessage('el recibo no se marcó como enviado'));
    await prisma.customer_receipts.update({ where: { id }, data: { sent_at: new Date(), sent_to: parsed.data.to } });
    revalidate();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'enviar el recibo');
  }
}
