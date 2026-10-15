import moment from 'moment';
import { argentinaDate } from '@/shared/lib/argentina-time';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { getWithholdingsReport } from '../actions/withholdings-report.server';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { WithholdingsView } from './components/WithholdingsView';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Retenciones practicadas en el mes (`?period=YYYY-MM`, por defecto el actual). */
export default async function WithholdingsTabContent({
  searchParams,
  permissions,
}: {
  searchParams: DataTableSearchParams;
  permissions: Record<string, boolean>;
}) {
  if (permissions['compras:retenciones:view'] !== true) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  const raw = (searchParams as Record<string, string | string[] | undefined>).period;
  const period = typeof raw === 'string' && PERIOD_RE.test(raw) ? raw : argentinaDate().slice(0, 7);
  const report = await getWithholdingsReport(period);
  if (!report) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
  // Los ultimos 18 meses: las retenciones se declaran mes a mes.
  const periods = Array.from({ length: 18 }, (_, i) => moment(argentinaDate()).subtract(i, 'months').format('YYYY-MM'));
  return <WithholdingsView initialReport={report} periods={periods.includes(period) ? periods : [period, ...periods]} />;
}
