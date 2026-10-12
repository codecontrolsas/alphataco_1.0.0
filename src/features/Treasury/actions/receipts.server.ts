'use server';

import { formatVoucherLabel } from '@/features/Comercial/Facturacion/lib/invoice-type';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions';
import { mailNotSentMessage } from '@/features/Purchases/lib/supplier-send';
import { sendDocumentSchema, type SendDocumentValues } from '@/features/Purchases/schemas/send';
import type { payment_method } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { sendCustomerReceiptEmail } from '@/shared/lib/mail/templates/treasury';
import { toPdfDownload } from '@/shared/lib/pdf/react-pdf.server';
import type { PdfDownload } from '@/shared/lib/pdf/types';
import { prisma } from '@/shared/lib/prisma';
import { storagePublicUrl, storageRemove } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { NO_PERMISSION, UUID_RE, firstIssue, toTreasuryActionError } from '../lib/action-errors';
import { CHECK_STATUS_LABELS } from '../lib/check-transitions';
import { createCheck, findAliveDuplicates, lockChecks, moveCheck } from '../lib/checks';
import { nextReceiptNumber } from '../lib/document-number';
import { cancelMovements, createMovement } from '../lib/movements';
import { lockReceipt } from '../lib/receipt-locks';
import { closingError, closingGap } from '../lib/receipt-math';
import { receiptPaymentMovementDate } from '../lib/receipt-rules';
import { assertReceiptCustomer, writeReceiptDraft } from '../lib/receipt-writer';
import { availableAdvancesOfCustomer, openInvoicesOfCustomer } from '../lib/receivables';
import { openCheckDebtsOfCustomer, rejectedCheckLabel } from '../lib/rejected-checks';
import { CUSTOMER_FILES_BUCKET } from '../lib/storage-files';
import { TreasuryError } from '../lib/treasury-errors';
import { renderCustomerReceiptPdf } from '../pdf/render-receipt-pdf.server';
import { cancelReasonSchema } from '../schemas/movements';
import { emptyReceiptForm, receiptFormSchema, type ReceiptFormValues } from '../schemas/receipts';
import { getActiveTreasuryAccountOptions } from './accounts.server';
import { SESSION_EXPIRED, TRANSACTION_OPTIONS, localToday, revalidateTreasury } from './shared';

/**
 * Recibos de cobranza (spec Tesorería etapa 2 §3). Borrador (sin número ni efecto) → confirmado
 * (toma número, mueve las cuentas) → anulado. Un recibo confirmado no se edita: se anula.
 */

const logger = new Logger('features/Treasury/receipts');

const NOT_FOUND = 'El recibo no existe';
const COMMERCIAL_PATH = '/dashboard/comercial/facturacion';

/** El CHECK de la base impide un cheque de tercero endosado como medio de cobro. */
function receiptMethod(method: payment_method): ReceiptFormValues['payments'][number]['method'] {
  if (method === 'THIRD_PARTY_CHECK') throw new TreasuryError('Un recibo no cobra con un cheque de tercero endosado');
  return method;
}

function revalidate() {
  revalidateTreasury();
  revalidatePath(COMMERCIAL_PATH, 'layout');
}

/** Borra de MinIO los certificados de retenciones que ya no existen (después del commit). */
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
        company_id: companyId,
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

const isoDay = (value: Date) => value.toISOString().slice(0, 10);

/**
 * Datos del editor: para el cliente elegido (o el del borrador) sus comprobantes abiertos,
 * anticipos y las cuentas con saldo. El propio borrador no reserva.
 */
export async function getReceiptFormData(input: { receiptId?: string; customerId?: string }) {
  const [canCreate, canUpdate] = await Promise.all([
    checkPermissionServer('tesoreria', 'cobranzas', 'create'),
    checkPermissionServer('tesoreria', 'cobranzas', 'update'),
  ]);
  if (!canCreate && !canUpdate) return null;
  const companyId = await getActiveCompanyId();

  let receipt: {
    id: string;
    values: ReceiptFormValues;
    withholdingFiles: Record<string, { name: string; url: string }>;
  } | null = null;
  if (input.receiptId) {
    if (!UUID_RE.test(input.receiptId)) return null;
    const row = await prisma.customer_receipts.findFirst({
      where: { id: input.receiptId, company_id: companyId, status: 'DRAFT' },
      select: {
        id: true,
        customer_id: true,
        date: true,
        notes: true,
        lines: {
          orderBy: { position: 'asc' },
          select: {
            kind: true,
            invoice_id: true,
            source_line_id: true,
            third_party_check_id: true,
            currency: true,
            applied_amount: true,
            exchange_rate: true,
            description: true,
          },
        },
        withholdings: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            tax: true,
            jurisdiction: true,
            certificate_number: true,
            certificate_date: true,
            amount: true,
            file_path: true,
            file_name: true,
          },
        },
        payments: {
          orderBy: { id: 'asc' },
          select: {
            method: true,
            treasury_account_id: true,
            amount: true,
            reference: true,
            check_number: true,
            check_bank: true,
            check_due_on: true,
            check_issue_date: true,
            drawer_name: true,
            drawer_cuit: true,
          },
        },
      },
    });
    if (!row) return null;
    const rates = new Map<string, string>();
    for (const l of row.lines)
      if (l.kind === 'INVOICE' && l.currency !== 'ARS') rates.set(l.currency, l.exchange_rate.toFixed(6));
    const advance = row.lines.find((l) => l.kind === 'ADVANCE');
    const values: ReceiptFormValues = {
      ...emptyReceiptForm(isoDay(row.date), row.customer_id),
      notes: row.notes ?? '',
      rates: [...rates].map(([currency, rate]) => ({ currency: currency as 'USD' | 'EUR', rate })),
      invoices: row.lines
        .filter((l) => l.kind === 'INVOICE' && l.invoice_id)
        .map((l) => ({ invoiceId: l.invoice_id as string, amount: l.applied_amount.toFixed(2) })),
      advancesApplied: row.lines
        .filter((l) => l.kind === 'ADVANCE_APPLIED' && l.source_line_id)
        .map((l) => ({ sourceLineId: l.source_line_id as string, amount: l.applied_amount.toFixed(2) })),
      advance: { amount: advance ? advance.applied_amount.toFixed(2) : '', description: advance?.description ?? '' },
      withholdings: row.withholdings.map((w) => ({
        id: w.id,
        tax: w.tax,
        jurisdiction: w.jurisdiction ?? '',
        certificateNumber: w.certificate_number,
        certificateDate: isoDay(w.certificate_date),
        amount: w.amount.toFixed(2),
      })),
      payments: row.payments.map((p) => ({
        method: receiptMethod(p.method),
        accountId: p.treasury_account_id,
        amount: p.amount.toFixed(2),
        reference: p.reference ?? '',
        checkNumber: p.check_number ?? '',
        checkBank: p.check_bank ?? '',
        checkDueOn: p.check_due_on ? isoDay(p.check_due_on) : '',
        checkIssueDate: p.check_issue_date ? isoDay(p.check_issue_date) : '',
        drawerName: p.drawer_name ?? '',
        drawerCuit: p.drawer_cuit ?? '',
      })),
      rejectedChecks: row.lines
        .filter((l) => l.kind === 'REJECTED_CHECK' && l.third_party_check_id)
        .map((l) => ({ checkId: l.third_party_check_id as string, amount: l.applied_amount.toFixed(2) })),
    };
    const withholdingFiles: Record<string, { name: string; url: string }> = {};
    for (const w of row.withholdings) {
      if (w.file_path && w.file_name)
        withholdingFiles[w.id] = { name: w.file_name, url: await storagePublicUrl(CUSTOMER_FILES_BUCKET, w.file_path) };
    }
    receipt = { id: row.id, values, withholdingFiles };
  }

  // El cliente que pide el editor manda (puede haberlo cambiado en el borrador); si no, el del borrador.
  const customerId =
    (input.customerId && UUID_RE.test(input.customerId) ? input.customerId : null) ??
    receipt?.values.customerId ??
    null;
  const exclude = receipt ? { excludeReceiptId: receipt.id } : {};
  const [customer, openInvoices, advances, accounts, checkDebts] = await Promise.all([
    customerId
      ? prisma.customers.findFirst({
          where: { id: customerId, company_id: companyId },
          select: { id: true, name: true, cuit: true, client_email: true },
        })
      : Promise.resolve(null),
    customerId
      ? openInvoicesOfCustomer(prisma, companyId, customerId, {
          ...exclude,
          include: receipt?.values.invoices.map((l) => l.invoiceId) ?? [],
        })
      : Promise.resolve([]),
    customerId ? availableAdvancesOfCustomer(prisma, companyId, customerId, exclude) : Promise.resolve([]),
    getActiveTreasuryAccountOptions(),
    customerId
      ? openCheckDebtsOfCustomer(prisma, companyId, customerId, {
          ...exclude,
          include: receipt?.values.rejectedChecks?.map((l) => l.checkId) ?? [],
        })
      : Promise.resolve([]),
  ]);
  return {
    today: localToday(),
    customer: customer
      ? {
          id: customer.id,
          label: `${customer.name} · CUIT ${customer.cuit.toString()}`,
          name: customer.name,
          cuit: customer.cuit.toString(),
          email: customer.client_email,
        }
      : null,
    receipt,
    openInvoices,
    advances,
    accounts,
    checkDebts,
  };
}

export type ReceiptFormData = NonNullable<Awaited<ReturnType<typeof getReceiptFormData>>>;

/**
 * Aviso del editor (etapa 3a): cheques vigentes iguales a los que se están cargando. No bloquea;
 * el índice de la base es el que impide confirmar un repetido.
 */
export async function findDuplicateReceiptChecks(
  checks: { bank: string; number: string; drawerCuit: string }[]
): Promise<ActionResult<{ id: string; number: string; bank: string; status: string }[]>> {
  if (!(await checkPermissionServer('tesoreria', 'cobranzas', 'view'))) return fail(NO_PERMISSION);
  const companyId = await getActiveCompanyId();
  const found = await findAliveDuplicates(prisma, companyId, checks.slice(0, 50));
  return ok(found.map((c) => ({ id: c.id, number: c.number, bank: c.bank, status: CHECK_STATUS_LABELS[c.status] })));
}

/** Detalle de un recibo (cualquier estado) para la página del recibo y el PDF. */
export async function getReceiptDetail(id: string) {
  if (!(await checkPermissionServer('tesoreria', 'cobranzas', 'view'))) return null;
  if (!UUID_RE.test(id)) return null;
  const companyId = await getActiveCompanyId();
  const today = localToday();
  const row = await prisma.customer_receipts.findFirst({
    where: { id, company_id: companyId },
    select: {
      id: true,
      number: true,
      status: true,
      date: true,
      notes: true,
      invoices_total: true,
      advance_total: true,
      advances_applied_total: true,
      withholdings_total: true,
      received_total: true,
      fx_difference_total: true,
      sent_at: true,
      sent_to: true,
      created_at: true,
      confirmed_at: true,
      cancelled_at: true,
      cancel_reason: true,
      creator: { select: { fullname: true, email: true } },
      confirmer: { select: { fullname: true, email: true } },
      canceller: { select: { fullname: true, email: true } },
      customer: { select: { id: true, name: true, cuit: true, client_email: true } },
      lines: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          kind: true,
          currency: true,
          applied_amount: true,
          exchange_rate: true,
          invoice_exchange_rate: true,
          amount_ars: true,
          fx_difference: true,
          description: true,
          invoice: { select: { id: true, cbte_type: true, number: true, sales_point: { select: { number: true } } } },
          source_line: { select: { receipt: { select: { id: true, number: true } } } },
          third_party_check: { select: { id: true, number: true, bank: true } },
        },
      },
      withholdings: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          tax: true,
          jurisdiction: true,
          certificate_number: true,
          certificate_date: true,
          amount: true,
          file_path: true,
          file_name: true,
        },
      },
      payments: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          method: true,
          amount: true,
          reference: true,
          check_number: true,
          check_bank: true,
          check_due_on: true,
          drawer_name: true,
          treasury_account: { select: { id: true, name: true } },
          movement: { select: { id: true, date: true, cancelled_at: true } },
          check: { select: { id: true, status: true } },
        },
      },
    },
  });
  if (!row) return null;
  const who = (p: { fullname: string | null; email: string | null } | null) => (p ? p.fullname ?? p.email ?? '' : null);
  const withholdings = await Promise.all(
    row.withholdings.map(async (w) => ({
      id: w.id,
      tax: w.tax,
      jurisdiction: w.jurisdiction,
      certificateNumber: w.certificate_number,
      certificateDate: isoDay(w.certificate_date),
      amount: w.amount.toFixed(2),
      file:
        w.file_path && w.file_name
          ? { name: w.file_name, url: await storagePublicUrl(CUSTOMER_FILES_BUCKET, w.file_path) }
          : null,
    }))
  );
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    date: isoDay(row.date),
    notes: row.notes,
    totals: {
      invoices: row.invoices_total.toFixed(2),
      advance: row.advance_total.toFixed(2),
      advancesApplied: row.advances_applied_total.toFixed(2),
      withholdings: row.withholdings_total.toFixed(2),
      received: row.received_total.toFixed(2),
      fxDifference: row.fx_difference_total.toFixed(2),
    },
    sentAt: row.sent_at?.toISOString() ?? null,
    sentTo: row.sent_to,
    createdBy: who(row.creator),
    confirmedBy: who(row.confirmer),
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
    cancelledBy: who(row.canceller),
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    cancelReason: row.cancel_reason,
    customer: {
      id: row.customer.id,
      name: row.customer.name,
      cuit: row.customer.cuit.toString(),
      email: row.customer.client_email,
    },
    lines: row.lines.map((l) => ({
      id: l.id,
      kind: l.kind,
      currency: l.currency.trim(),
      applied: l.applied_amount.toFixed(2),
      rate: l.exchange_rate.toFixed(6),
      invoiceRate: l.invoice_exchange_rate.toFixed(6),
      ars: l.amount_ars.toFixed(2),
      fxDifference: l.fx_difference.toFixed(2),
      description: l.description,
      invoice: l.invoice
        ? {
            id: l.invoice.id,
            label: formatVoucherLabel(l.invoice.cbte_type, l.invoice.sales_point.number, l.invoice.number),
          }
        : null,
      sourceReceipt: l.source_line?.receipt ?? null,
      rejectedCheck: l.third_party_check
        ? {
            id: l.third_party_check.id,
            label: rejectedCheckLabel(l.third_party_check.number, l.third_party_check.bank),
          }
        : null,
    })),
    withholdings,
    payments: row.payments.map((p) => {
      const movementDate = p.movement ? isoDay(p.movement.date) : null;
      return {
        id: p.id,
        method: p.method,
        amount: p.amount.toFixed(2),
        reference: p.reference,
        checkNumber: p.check_number,
        checkBank: p.check_bank,
        checkDueOn: p.check_due_on ? isoDay(p.check_due_on) : null,
        drawerName: p.drawer_name,
        check: p.check ? { id: p.check.id, status: CHECK_STATUS_LABELS[p.check.status] } : null,
        account: p.treasury_account,
        movement: p.movement
          ? {
              id: p.movement.id,
              date: movementDate as string,
              future: (movementDate as string) > today,
              cancelled: p.movement.cancelled_at !== null,
            }
          : null,
      };
    }),
  };
}

export type ReceiptDetail = NonNullable<Awaited<ReturnType<typeof getReceiptDetail>>>;
