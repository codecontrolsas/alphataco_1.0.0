'use server';

import JSZip from 'jszip';
import moment from 'moment';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { NO_PERMISSION } from '../lib/action-errors';
import { cents, money } from '../lib/payment-totals';
import { trimDecimals } from '../lib/quantity-format';
import { WITHHOLDING_TXT_FILE_NAMES, withholdingTxtFile, type WithholdingTxtRow } from '../lib/withholding-txt';
import { WITHHOLDING_TAXES, type WithholdingTax } from '../schemas/payment-settings';

/**
 * Retenciones practicadas en el mes (spec Compras etapa 5 §4): las de ordenes pagadas con fecha de
 * pago en el periodo. Las anuladas se listan marcadas y no suman ni van a los archivos.
 */

const logger = new Logger('features/Purchases/withholdings-report');
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

async function loadPeriod(companyId: string, period: string, tax?: WithholdingTax) {
  const start = moment(period, 'YYYY-MM').startOf('month');
  return prisma.payment_order_withholdings.findMany({
    where: {
      certificate_number: { not: null },
      ...(tax ? { tax } : {}),
      payment_order: {
        company_id: companyId,
        paid_on: { gte: new Date(`${start.format('YYYY-MM-DD')}T00:00:00.000Z`), lt: new Date(`${start.clone().add(1, 'month').format('YYYY-MM-DD')}T00:00:00.000Z`) },
      },
    },
    select: {
      id: true,
      tax: true,
      base: true,
      rate: true,
      amount: true,
      certificate_number: true,
      cancelled_at: true,
      supplier_status: true,
      exclusion_percentage: true,
      regime: { select: { code: true, description: true } },
      payment_order: {
        select: {
          id: true,
          number: true,
          paid_on: true,
          net_total: true,
          withholdings_total: true,
          supplier: { select: { id: true, name: true, cuit: true } },
        },
      },
    },
    orderBy: [{ tax: 'asc' }, { certificate_number: 'asc' }],
  });
}

export async function getWithholdingsReport(period: string, tax?: WithholdingTax) {
  if (!PERIOD_RE.test(period)) return null;
  if (!(await checkPermissionServer('compras', 'retenciones', 'view'))) return null;
  if (tax && !WITHHOLDING_TAXES.includes(tax)) return null;
  const companyId = await getActiveCompanyId();
  const rows = await loadPeriod(companyId, period, tax);
  const live = rows.filter((r) => r.cancelled_at === null);
  const byRegime = new Map<string, { tax: WithholdingTax; regime: string; count: number; base: bigint; amount: bigint }>();
  for (const r of live) {
    const key = `${r.tax}:${r.regime.code}`;
    const current = byRegime.get(key) ?? { tax: r.tax, regime: `${r.regime.code} · ${r.regime.description}`, count: 0, base: BigInt(0), amount: BigInt(0) };
    current.count += 1;
    current.base += cents(r.base.toFixed(2));
    current.amount += cents(r.amount.toFixed(2));
    byRegime.set(key, current);
  }
  return {
    period,
    rows: rows.map((r) => ({
      id: r.id,
      tax: r.tax,
      certificateNumber: r.certificate_number!,
      paidOn: r.payment_order.paid_on!.toISOString().slice(0, 10),
      order: { id: r.payment_order.id, number: r.payment_order.number },
      supplier: { id: r.payment_order.supplier.id, name: r.payment_order.supplier.name, cuit: r.payment_order.supplier.cuit.toString() },
      regime: `${r.regime.code} · ${r.regime.description}`,
      base: r.base.toFixed(2),
      rate: trimDecimals(r.rate.toFixed(4)),
      amount: r.amount.toFixed(2),
      cancelled: r.cancelled_at !== null,
    })),
    totals: [...byRegime.values()]
      .sort((a, b) => WITHHOLDING_TAXES.indexOf(a.tax) - WITHHOLDING_TAXES.indexOf(b.tax) || a.regime.localeCompare(b.regime))
      .map((t) => ({ tax: t.tax, regime: t.regime, count: t.count, base: money(t.base), amount: money(t.amount) })),
    total: money(live.reduce((acc, r) => acc + cents(r.amount.toFixed(2)), BigInt(0))),
  };
}

export type WithholdingsReport = NonNullable<Awaited<ReturnType<typeof getWithholdingsReport>>>;

/** ZIP con un archivo por impuesto con retenciones en el periodo (SICORE, SIRE y Neuquen). */
export async function exportWithholdingsTxt(period: string): Promise<ActionResult<{ fileName: string; base64: string }>> {
  if (!(await checkPermissionServer('compras', 'retenciones', 'view'))) return fail(NO_PERMISSION);
  if (!PERIOD_RE.test(period)) return fail('Período inválido');
  const companyId = await getActiveCompanyId();
  try {
    const rows = (await loadPeriod(companyId, period)).filter((r) => r.cancelled_at === null);
    const zip = new JSZip();
    for (const tax of WITHHOLDING_TAXES) {
      const ofTax = rows.filter((r) => r.tax === tax);
      if (ofTax.length === 0) continue;
      const txtRows = ofTax.map((r): WithholdingTxtRow => {
        // Situacion y exclusion guardadas al calcular: el archivo de un mes no cambia si despues se edita el perfil.
        return {
          tax,
          regimeCode: r.regime.code,
          paidOn: r.payment_order.paid_on!.toISOString().slice(0, 10),
          paymentOrderNumber: r.payment_order.number,
          paymentTotal: money(cents(r.payment_order.net_total.toFixed(2)) + cents(r.payment_order.withholdings_total.toFixed(2))),
          base: r.base.toFixed(2),
          rate: trimDecimals(r.rate.toFixed(4)),
          amount: r.amount.toFixed(2),
          supplierCuit: r.payment_order.supplier.cuit.toString(),
          supplierStatus: r.supplier_status ?? 'SUBJECT',
          certificateNumber: r.certificate_number!,
          exclusionPercentage: r.exclusion_percentage ? trimDecimals(r.exclusion_percentage.toFixed(4)) : null,
        };
      });
      zip.file(`${WITHHOLDING_TXT_FILE_NAMES[tax]}.txt`, withholdingTxtFile(tax, txtRows));
    }
    const base64 = await zip.generateAsync({ type: 'base64' });
    return ok({ fileName: `RETENCIONES_${period}.zip`, base64 });
  } catch (error) {
    logger.error('Error al generar los archivos de retenciones', { data: { error, period } });
    return fail('No se pudieron generar los archivos. Intentá de nuevo; si persiste, avisá a soporte.');
  }
}
