import 'server-only';

import { hasPermissionCached } from '@/features/Layout/sidebar/lib/section-count-loaders';
import { getReceivablesSummary } from '@/features/Treasury/actions/customer-statement.server';
import { getAccountIndicators } from '@/features/Treasury/lib/balances';
import { COLLECTABLE_CBTE_TYPES, CREDIT_NOTE_CBTE_TYPES } from '@/features/Treasury/lib/receipt-rules';
import { treasuryToday } from '@/features/Treasury/lib/today';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';
import { cache } from 'react';

const logger = new Logger('features/Dashboard/Resumen/cash');

/** Sin permiso y error se distinguen: ninguno de los dos se dibuja como "$ 0". */
export type CashSource<T> = { status: 'ok'; data: T } | { status: 'forbidden' } | { status: 'error' };

export interface CashPosition {
  /** Saldo de hoy sumado de las cuentas activas (Tesorería trabaja solo en pesos). */
  available: CashSource<{ total: string; accounts: number }>;
  /** Pendiente de cobro en pesos: total y la parte ya vencida. */
  receivable: CashSource<{ total: string; overdue: string; invoices: number }>;
  /** Facturado en el mes en curso y en el anterior, en pesos (notas de crédito restan). */
  billed: CashSource<{ month: string; previous: string; monthLabel: string }>;
}

async function guarded<T>(allowed: Promise<boolean>, load: () => Promise<T>, what: string): Promise<CashSource<T>> {
  if (!(await allowed)) return { status: 'forbidden' };
  try {
    return { status: 'ok', data: await load() };
  } catch (error) {
    logger.error(`Error al calcular ${what}`, { data: { error } });
    return { status: 'error' };
  }
}

async function loadAvailable() {
  const companyId = await getActiveCompanyId();
  const accounts = await prisma.treasury_accounts.findMany({
    where: { company_id: companyId, is_active: true },
    select: { id: true },
  });
  if (accounts.length === 0) return { total: '0.00', accounts: 0 };
  const indicators = await getAccountIndicators(
    prisma,
    companyId,
    treasuryToday(),
    accounts.map((account) => account.id)
  );
  const total = [...indicators.values()].reduce(
    (sum, item) => sum.add(new Prisma.Decimal(item.balance)),
    new Prisma.Decimal(0)
  );
  return { total: total.toFixed(2), accounts: accounts.length };
}

async function loadReceivable() {
  const ars = (await getReceivablesSummary()).find((row) => row.currency === 'ARS');
  return { total: ars?.total ?? '0.00', overdue: ars?.overdue ?? '0.00', invoices: ars?.count ?? 0 };
}

async function loadBilled() {
  const companyId = await getActiveCompanyId();
  const today = moment(treasuryToday(), 'YYYY-MM-DD');
  const monthStart = today.clone().startOf('month').format('YYYY-MM-DD');
  const previousStart = today.clone().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
  const todayIso = today.format('YYYY-MM-DD');
  const signed = [...COLLECTABLE_CBTE_TYPES, ...CREDIT_NOTE_CBTE_TYPES];
  // Mismo día del mes anterior: la comparación es "a esta altura del mes", no contra el mes cerrado.
  const previousSameDay = today.clone().subtract(1, 'month').format('YYYY-MM-DD');
  const [row] = await prisma.$queryRaw<{ month: string; previous: string }[]>`
    SELECT
      COALESCE(SUM(sign * total * exchange_rate) FILTER (WHERE issue_date >= ${monthStart}::date AND issue_date <= ${todayIso}::date), 0)::numeric(15,2)::text AS month,
      COALESCE(SUM(sign * total * exchange_rate) FILTER (WHERE issue_date >= ${previousStart}::date AND issue_date <= ${previousSameDay}::date), 0)::numeric(15,2)::text AS previous
    FROM (
      SELECT CASE WHEN cbte_type = ANY(${[...CREDIT_NOTE_CBTE_TYPES]}::int[]) THEN -1 ELSE 1 END AS sign, total, exchange_rate, issue_date
      FROM invoices
      WHERE company_id = ${companyId}::uuid AND status = 'autorizada' AND cbte_type = ANY(${signed}::int[])
        AND issue_date >= ${previousStart}::date
    ) t
  `;
  const monthLabel = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${monthStart}T00:00:00Z`)
  );
  return { month: row?.month ?? '0.00', previous: row?.previous ?? '0.00', monthLabel };
}

/** Plata de la empresa hoy: lo disponible, lo que falta cobrar y lo facturado en el mes. Cada parte con su permiso. */
export const loadCashPosition = cache(async (): Promise<CashPosition> => {
  const canBill = Promise.all([
    hasPermissionCached('comercial', 'facturacion', 'view'),
    hasPermissionCached('comercial', 'facturacion', 'view_prices'),
  ]).then(([view, prices]) => view && prices);
  const [available, receivable, billed] = await Promise.all([
    guarded(hasPermissionCached('tesoreria', 'cuentas', 'view'), loadAvailable, 'el disponible en cuentas'),
    guarded(hasPermissionCached('tesoreria', 'cobranzas', 'view'), loadReceivable, 'el pendiente de cobro'),
    guarded(canBill, loadBilled, 'lo facturado en el mes'),
  ]);
  return { available, receivable, billed };
});
