'use server';

import JSZip from 'jszip';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { AMOUNT_SCALE, formatScaled, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { VAT_RATE_LABELS, isVatRateId } from '@/shared/lib/arca/catalogs';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { NO_PERMISSION } from '../lib/action-errors';
import { CREDIT_NOTE_TYPES, supplierInvoiceLabel } from '../lib/invoices';
import type { SupplierInvoiceStatus } from '../lib/invoice-status';
import { vatBookTxtFiles, type VatBookTxtRow } from '../lib/vat-book-txt';

/**
 * Libro IVA Compras (spec Compras etapa 4 §3.6): los comprobantes vigentes del periodo de IVA
 * (incluidos observados y rechazados), con las NC restando, y los TXT del Libro IVA Digital.
 */

const logger = new Logger('features/Purchases/vat-book');

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ZERO = BigInt(0);

const amount = (value: { toString(): string }) => parseScaled(value.toString(), AMOUNT_SCALE) ?? ZERO;
const fmt = (value: bigint) => formatScaled(value, AMOUNT_SCALE);

/** Comprobantes vigentes del periodo con lo que necesitan la pantalla y el TXT. */
async function loadPeriod(companyId: string, period: string) {
  return prisma.supplier_invoices.findMany({
    where: { company_id: companyId, vat_period: period, status: { not: 'CANCELLED' } },
    select: {
      id: true,
      cbte_type: true,
      sales_point: true,
      number: true,
      issue_date: true,
      status: true,
      net_taxed: true,
      net_untaxed: true,
      exempt: true,
      vat_total: true,
      vat_perceptions: true,
      gross_income_perceptions: true,
      other_taxes: true,
      total: true,
      supplier: { select: { name: true, cuit: true } },
      vat: { select: { vat_rate_id: true, base: true, amount: true }, orderBy: { vat_rate_id: 'asc' } },
      taxes: { select: { kind: true, amount: true } },
    },
    orderBy: [{ issue_date: 'asc' }, { cbte_type: 'asc' }, { sales_point: 'asc' }, { number: 'asc' }],
  });
}

/** El libro del periodo (`YYYY-MM`). `null` sin permiso o con un periodo invalido. */
export async function getPurchasesVatBook(period: string) {
  if (!PERIOD_RE.test(period)) return null;
  if (!(await checkPermissionServer('compras', 'libro-iva', 'view'))) return null;
  const companyId = await getActiveCompanyId();
  const invoices = await loadPeriod(companyId, period);

  const rates = new Set<number>();
  const totals = {
    netTaxed: ZERO,
    netUntaxed: ZERO,
    exempt: ZERO,
    vatPerceptions: ZERO,
    grossIncomePerceptions: ZERO,
    otherTaxes: ZERO,
    total: ZERO,
    vat: new Map<number, bigint>(),
  };

  const rows = invoices.map((invoice) => {
    const sign = CREDIT_NOTE_TYPES.includes(invoice.cbte_type) ? BigInt(-1) : BigInt(1);
    const signed = (value: { toString(): string }) => amount(value) * sign;
    const vat: Record<number, string> = {};
    for (const line of invoice.vat) {
      rates.add(line.vat_rate_id);
      const value = signed(line.amount);
      vat[line.vat_rate_id] = fmt(value);
      totals.vat.set(line.vat_rate_id, (totals.vat.get(line.vat_rate_id) ?? ZERO) + value);
    }
    const values = {
      netTaxed: signed(invoice.net_taxed),
      netUntaxed: signed(invoice.net_untaxed),
      exempt: signed(invoice.exempt),
      vatPerceptions: signed(invoice.vat_perceptions),
      grossIncomePerceptions: signed(invoice.gross_income_perceptions),
      otherTaxes: signed(invoice.other_taxes),
      total: signed(invoice.total),
    };
    totals.netTaxed += values.netTaxed;
    totals.netUntaxed += values.netUntaxed;
    totals.exempt += values.exempt;
    totals.vatPerceptions += values.vatPerceptions;
    totals.grossIncomePerceptions += values.grossIncomePerceptions;
    totals.otherTaxes += values.otherTaxes;
    totals.total += values.total;
    return {
      id: invoice.id,
      issueDate: invoice.issue_date.toISOString().slice(0, 10),
      label: supplierInvoiceLabel(invoice),
      status: invoice.status as SupplierInvoiceStatus,
      supplier: { name: invoice.supplier.name, cuit: invoice.supplier.cuit.toString() },
      netTaxed: fmt(values.netTaxed),
      netUntaxed: fmt(values.netUntaxed),
      exempt: fmt(values.exempt),
      vat,
      vatPerceptions: fmt(values.vatPerceptions),
      grossIncomePerceptions: fmt(values.grossIncomePerceptions),
      otherTaxes: fmt(values.otherTaxes),
      total: fmt(values.total),
    };
  });

  const vatRates = [...rates]
    .sort((a, b) => a - b)
    .map((id) => ({ id, label: isVatRateId(id) ? `IVA ${VAT_RATE_LABELS[id]}` : `IVA ${id}` }));

  return {
    period,
    rows,
    vatRates,
    totals: {
      netTaxed: fmt(totals.netTaxed),
      netUntaxed: fmt(totals.netUntaxed),
      exempt: fmt(totals.exempt),
      vat: Object.fromEntries([...totals.vat.entries()].map(([id, value]) => [id, fmt(value)])) as Record<number, string>,
      vatPerceptions: fmt(totals.vatPerceptions),
      grossIncomePerceptions: fmt(totals.grossIncomePerceptions),
      otherTaxes: fmt(totals.otherTaxes),
      total: fmt(totals.total),
    },
  };
}

export type PurchasesVatBook = NonNullable<Awaited<ReturnType<typeof getPurchasesVatBook>>>;

/** Periodos con comprobantes (mas recientes primero), siempre con el mes actual. */
export async function getPurchasesVatBookPeriods(): Promise<string[]> {
  if (!(await checkPermissionServer('compras', 'libro-iva', 'view'))) return [];
  const companyId = await getActiveCompanyId();
  const rows = await prisma.supplier_invoices.groupBy({
    by: ['vat_period'],
    where: { company_id: companyId, status: { not: 'CANCELLED' } },
  });
  const current = argentinaDate().slice(0, 7);
  return [...new Set([current, ...rows.map((r) => r.vat_period)])].sort().reverse();
}

/** ZIP con los dos TXT del Libro IVA Digital del periodo, en base64. */
export async function exportPurchasesVatBookTxt(period: string): Promise<ActionResult<{ fileName: string; base64: string }>> {
  if (!(await checkPermissionServer('compras', 'libro-iva', 'view'))) return fail(NO_PERMISSION);
  if (!PERIOD_RE.test(period)) return fail('Período inválido');
  const companyId = await getActiveCompanyId();
  try {
    const invoices = await loadPeriod(companyId, period);
    const rows = invoices.map((invoice): VatBookTxtRow => {
      const byKind = (kind: string) => fmt(invoice.taxes.filter((t) => t.kind === kind).reduce((acc, t) => acc + amount(t.amount), ZERO));
      return {
        issueDate: invoice.issue_date.toISOString().slice(0, 10),
        cbteType: invoice.cbte_type,
        salesPoint: invoice.sales_point,
        number: invoice.number.toString(),
        supplierCuit: invoice.supplier.cuit.toString(),
        supplierName: invoice.supplier.name,
        total: invoice.total.toString(),
        netTaxed: invoice.net_taxed.toString(),
        netUntaxed: invoice.net_untaxed.toString(),
        exempt: invoice.exempt.toString(),
        vatTotal: invoice.vat_total.toString(),
        vatPerceptions: invoice.vat_perceptions.toString(),
        grossIncomePerceptions: invoice.gross_income_perceptions.toString(),
        internalTaxes: byKind('INTERNAL_TAX'),
        otherTaxes: byKind('OTHER_TAX'),
        vat: invoice.vat.map((v) => ({ vatRateId: v.vat_rate_id, base: v.base.toString(), amount: v.amount.toString() })),
      };
    });
    const files = vatBookTxtFiles(rows);
    const zip = new JSZip();
    zip.file('LIBRO_IVA_DIGITAL_COMPRAS_CBTE.txt', files.cbte);
    zip.file('LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS.txt', files.alicuotas);
    const base64 = await zip.generateAsync({ type: 'base64' });
    return ok({ fileName: `LIBRO_IVA_COMPRAS_${period}.zip`, base64 });
  } catch (error) {
    logger.error('Error al generar el TXT del Libro IVA Compras', { data: { error, period } });
    return fail('No se pudieron generar los archivos. Intentá de nuevo; si persiste, avisá a soporte.');
  }
}
