'use server';

import { formatVoucherLabel } from '@/features/Comercial/Facturacion/lib/invoice-type';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { payment_method } from '@/generated/prisma/enums';
import { prisma } from '@/shared/lib/prisma';
import { storagePublicUrl } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { NO_PERMISSION, UUID_RE } from '../lib/action-errors';
import { CHECK_STATUS_LABELS } from '../lib/check-transitions';
import { findAliveDuplicates } from '../lib/checks';
import { availableAdvancesOfCustomer, openInvoicesOfCustomer } from '../lib/receivables';
import { openCheckDebtsOfCustomer, rejectedCheckLabel } from '../lib/rejected-checks';
import { CUSTOMER_FILES_BUCKET } from '../lib/storage-files';
import { TreasuryError } from '../lib/treasury-errors';
import { emptyReceiptForm, type ReceiptFormValues } from '../schemas/receipts';
import { getActiveTreasuryAccountOptions } from './accounts.server';
import { localToday } from './shared';
import { isoDay } from '../lib/dates';

/** Lecturas de recibos de cobranza (editor, detalle, aviso de cheques repetidos). Sin efectos. */

/** El CHECK de la base impide un cheque de tercero endosado como medio de cobro. */
function receiptMethod(method: payment_method): ReceiptFormValues['payments'][number]['method'] {
  if (method === 'THIRD_PARTY_CHECK') throw new TreasuryError('Un recibo no cobra con un cheque de tercero endosado');
  return method;
}

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
