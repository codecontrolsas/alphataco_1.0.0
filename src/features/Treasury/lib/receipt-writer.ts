import 'server-only';

import { AMOUNT_SCALE, formatScaled, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { Prisma } from '@/generated/prisma/client';
import { formatAmountText } from '@/shared/utils/amount-text';
import { CUSTOMER_WITHHOLDING_TAX_LABELS, type ReceiptFormValues } from '../schemas/receipts';
import { assertActiveAccount, dateOnly } from './movements';
import { lockCustomerCertificates, lockReceivables } from './receipt-locks';
import { appliedToArs, fxDifference, RATE_SCALE, receiptTotals, type ReceiptLineAmounts, type ReceiptTotals } from './receipt-math';
import { CREDIT_NOTE_CBTE_TYPES, isCollectable } from './receipt-rules';
import { advanceBalances, invoiceBalances } from './receivables';
import { TreasuryError } from './treasury-errors';

/**
 * Escritura del borrador del recibo (spec Tesorería etapa 2 §3.1), compartida por guardar y
 * confirmar. Valida contra la base con los comprobantes y anticipos ya bloqueados, reemplaza
 * líneas y medios, sincroniza las retenciones por id (para no perder sus certificados) y
 * recalcula los totales. Ningún total viene del cliente.
 */

type WriterTx = Pick<
  Prisma.TransactionClient,
  | '$queryRaw'
  | '$executeRaw'
  | 'customer_receipts'
  | 'customer_receipt_lines'
  | 'customer_receipt_withholdings'
  | 'customer_receipt_payments'
  | 'customers'
  | 'treasury_accounts'
>;

const RATE_ONE = BigInt(1000000);
const ZERO = BigInt(0);

const cents = (value: string) => parseScaled(value, AMOUNT_SCALE) ?? ZERO;
const decimal = (value: bigint, scale = AMOUNT_SCALE) => new Prisma.Decimal(formatScaled(value, scale));

/** "$ 1.250,00" en pesos; "USD 1.250,00" en otra moneda. */
function inCurrency(value: bigint, currency: string): string {
  const text = formatAmountText(formatScaled(value, AMOUNT_SCALE));
  return currency === 'ARS' ? `$ ${text}` : `${currency} ${text}`;
}

/** El cliente es de la empresa; activo cuando se le crea un recibo (o se cambia a él). */
export async function assertReceiptCustomer(
  tx: Pick<Prisma.TransactionClient, 'customers'>,
  companyId: string,
  customerId: string,
  requireActive: boolean
): Promise<{ id: string; name: string }> {
  const customer = await tx.customers.findFirst({
    where: { id: customerId, company_id: companyId },
    select: { id: true, name: true, is_active: true },
  });
  if (!customer) throw new TreasuryError('El cliente no existe');
  if (requireActive && customer.is_active === false) throw new TreasuryError('El cliente está inactivo');
  return { id: customer.id, name: customer.name };
}

export type WrittenPayment = {
  id: string;
  method: ReceiptFormValues['payments'][number]['method'];
  accountId: string;
  amountCents: bigint;
  checkNumber: string | null;
  checkDueOn: string | null;
};

export type WrittenReceipt = {
  customerName: string;
  withholdingIds: string[];
  removedFiles: string[];
  totals: ReceiptTotals;
  lineCount: number;
  payments: WrittenPayment[];
};

export async function writeReceiptDraft(
  tx: WriterTx,
  input: { companyId: string; receiptId: string; requireActiveCustomer: boolean; values: ReceiptFormValues; today: string }
): Promise<WrittenReceipt> {
  const { companyId, receiptId, values: v } = input;
  const customer = await assertReceiptCustomer(tx, companyId, v.customerId, input.requireActiveCustomer);
  if (v.date > input.today) throw new TreasuryError('La fecha no puede ser futura');

  const invoiceIds = v.invoices.map((l) => l.invoiceId);
  const sourceIds = v.advancesApplied.map((l) => l.sourceLineId);
  await lockReceivables(tx, invoiceIds, sourceIds);

  // ── Comprobantes ──────────────────────────────────────────────────────────
  const rates = new Map(v.rates.map((r) => [r.currency as string, parseScaled(r.rate, RATE_SCALE) ?? ZERO]));
  const balances = await invoiceBalances(tx, invoiceIds, { excludeReceiptId: receiptId });
  const lines: (Prisma.customer_receipt_linesCreateManyInput & ReceiptLineAmounts)[] = [];
  for (const line of v.invoices) {
    const balance = balances.get(line.invoiceId);
    if (!balance || balance.companyId !== companyId || balance.customerId !== v.customerId) throw new TreasuryError('El comprobante no existe');
    if ((CREDIT_NOTE_CBTE_TYPES as readonly number[]).includes(balance.cbteType)) throw new TreasuryError('Las notas de crédito no se cobran');
    if (balance.status !== 'autorizada' || !isCollectable(balance.cbteType)) throw new TreasuryError(`${balance.label}: no está autorizado`);
    const rate = balance.currency === 'ARS' ? RATE_ONE : rates.get(balance.currency);
    if (!rate) throw new TreasuryError(`Indicá la cotización del ${balance.currency}`);
    const applied = cents(line.amount);
    const pending = cents(balance.pending);
    if (applied > pending) {
      const reserved = cents(balance.reserved) > ZERO ? ' y está reservado en otro borrador' : '';
      throw new TreasuryError(`${balance.label}: el pendiente es ${inCurrency(pending < ZERO ? ZERO : pending, balance.currency)}${reserved}`);
    }
    const invoiceRate = parseScaled(balance.exchangeRate, RATE_SCALE) ?? RATE_ONE;
    const amountArs = appliedToArs(applied, rate);
    const fx = balance.currency === 'ARS' ? ZERO : fxDifference(applied, rate, invoiceRate);
    lines.push({
      receipt_id: receiptId,
      position: lines.length,
      kind: 'INVOICE',
      invoice_id: line.invoiceId,
      currency: balance.currency,
      applied_amount: decimal(applied),
      exchange_rate: decimal(rate, RATE_SCALE),
      invoice_exchange_rate: decimal(balance.currency === 'ARS' ? RATE_ONE : invoiceRate, RATE_SCALE),
      amount_ars: decimal(amountArs),
      fx_difference: decimal(fx),
      amountArs,
      fxDifference: fx,
    });
  }

  // ── Anticipos aplicados ───────────────────────────────────────────────────
  const advances = await advanceBalances(tx, sourceIds, { excludeReceiptId: receiptId });
  for (const line of v.advancesApplied) {
    const advance = advances.get(line.sourceLineId);
    if (!advance || advance.companyId !== companyId || advance.customerId !== v.customerId) throw new TreasuryError('El anticipo no existe');
    const applied = cents(line.amount);
    const available = cents(advance.available);
    if (applied > available) {
      throw new TreasuryError(`El anticipo de ${advance.receiptNumber}: el disponible es ${inCurrency(available < ZERO ? ZERO : available, 'ARS')}`);
    }
    lines.push({
      receipt_id: receiptId,
      position: lines.length,
      kind: 'ADVANCE_APPLIED',
      source_line_id: line.sourceLineId,
      currency: 'ARS',
      applied_amount: decimal(applied),
      amount_ars: decimal(applied),
      amountArs: applied,
      fxDifference: ZERO,
    });
  }

  // ── Cobro a cuenta ────────────────────────────────────────────────────────
  if (v.advance.amount) {
    const amount = cents(v.advance.amount);
    lines.push({
      receipt_id: receiptId,
      position: lines.length,
      kind: 'ADVANCE',
      currency: 'ARS',
      applied_amount: decimal(amount),
      amount_ars: decimal(amount),
      description: v.advance.description || null,
      amountArs: amount,
      fxDifference: ZERO,
    });
  }

  // ── Medios ────────────────────────────────────────────────────────────────
  for (const p of v.payments) await assertActiveAccount(tx, companyId, p.accountId);

  // ── Retenciones: certificado único por cliente, impuesto y número ─────────
  await lockCustomerCertificates(tx, v.customerId);
  const seen = new Set<string>();
  for (const w of v.withholdings) {
    const label = `El certificado ${w.certificateNumber} de ${CUSTOMER_WITHHOLDING_TAX_LABELS[w.tax]}`;
    const key = `${w.tax}|${w.certificateNumber}`;
    if (seen.has(key)) throw new TreasuryError(`${label} está repetido`);
    seen.add(key);
    const taken = await tx.$queryRaw<{ number: string | null }[]>`
      SELECT r.number
      FROM customer_receipt_withholdings w
      JOIN customer_receipts r ON r.id = w.receipt_id
      WHERE w.company_id = ${companyId}::uuid AND w.customer_id = ${v.customerId}::uuid
        AND w.tax = ${w.tax}::withholding_tax AND w.certificate_number = ${w.certificateNumber}
        AND r.status <> 'CANCELLED' AND r.id <> ${receiptId}::uuid
      LIMIT 1
    `;
    if (taken[0]) throw new TreasuryError(`${label} ya está cargado en ${taken[0].number ?? 'un recibo en borrador'}`);
  }

  // ── Escritura ─────────────────────────────────────────────────────────────
  await tx.customer_receipt_lines.deleteMany({ where: { receipt_id: receiptId } });
  await tx.customer_receipt_payments.deleteMany({ where: { receipt_id: receiptId } });
  if (lines.length > 0) {
    await tx.customer_receipt_lines.createMany({ data: lines.map(({ amountArs: _a, fxDifference: _f, ...data }) => data) });
  }

  const existing = await tx.customer_receipt_withholdings.findMany({ where: { receipt_id: receiptId }, select: { id: true, file_path: true } });
  const existingIds = new Set(existing.map((w) => w.id));
  const keptIds = new Set(v.withholdings.map((w) => w.id).filter(Boolean));
  for (const id of keptIds) if (!existingIds.has(id)) throw new TreasuryError('La retención no existe');
  const removed = existing.filter((w) => !keptIds.has(w.id));
  if (removed.length > 0) await tx.customer_receipt_withholdings.deleteMany({ where: { id: { in: removed.map((w) => w.id) } } });
  const withholdingIds: string[] = [];
  for (const w of v.withholdings) {
    const data = {
      tax: w.tax,
      jurisdiction: w.tax === 'IIBB' ? w.jurisdiction : null,
      certificate_number: w.certificateNumber,
      certificate_date: dateOnly(w.certificateDate),
      amount: decimal(cents(w.amount)),
      customer_id: v.customerId,
    };
    if (w.id) {
      await tx.customer_receipt_withholdings.update({ where: { id: w.id }, data });
      withholdingIds.push(w.id);
    } else {
      const created = await tx.customer_receipt_withholdings.create({
        data: { ...data, receipt_id: receiptId, company_id: companyId },
        select: { id: true },
      });
      withholdingIds.push(created.id);
    }
  }

  const payments: WrittenPayment[] = [];
  for (const p of v.payments) {
    const isCheck = p.method === 'CHECK' || p.method === 'ECHECK';
    const amount = cents(p.amount);
    const created = await tx.customer_receipt_payments.create({
      data: {
        receipt_id: receiptId,
        method: p.method,
        treasury_account_id: p.accountId,
        amount: decimal(amount),
        reference: p.reference || null,
        check_number: isCheck ? p.checkNumber : null,
        check_bank: isCheck ? p.checkBank || null : null,
        check_due_on: isCheck ? dateOnly(p.checkDueOn) : null,
      },
      select: { id: true },
    });
    payments.push({
      id: created.id,
      method: p.method,
      accountId: p.accountId,
      amountCents: amount,
      checkNumber: isCheck ? p.checkNumber : null,
      checkDueOn: isCheck ? p.checkDueOn : null,
    });
  }

  const totals = receiptTotals({
    lines,
    withholdings: v.withholdings.map((w) => cents(w.amount)),
    payments: payments.map((p) => p.amountCents),
  });
  await tx.customer_receipts.update({
    where: { id: receiptId },
    data: {
      customer_id: v.customerId,
      date: dateOnly(v.date),
      notes: v.notes || null,
      invoices_total: decimal(totals.invoicesTotal),
      advance_total: decimal(totals.advanceTotal),
      advances_applied_total: decimal(totals.advancesAppliedTotal),
      withholdings_total: decimal(totals.withholdingsTotal),
      received_total: decimal(totals.receivedTotal),
      fx_difference_total: decimal(totals.fxDifferenceTotal),
    },
  });

  return {
    customerName: customer.name,
    withholdingIds,
    removedFiles: removed.map((w) => w.file_path).filter((path): path is string => Boolean(path)),
    totals,
    lineCount: lines.length,
    payments,
  };
}
