'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';

const logger = new Logger('features/Operaciones/PartesDiarios/queries');

/** `dailyreport.date` es `date` en Postgres: la UI espera siempre `YYYY-MM-DD`. */
function toIsoDate(value: Date): string {
  return moment.utc(value).format('YYYY-MM-DD');
}

// ============================================================================
// PARTES DIARIOS EXISTENTES
// ============================================================================

const DAILY_REPORT_SELECT = {
  id: true,
  date: true,
  creation_date: true,
  created_at: true,
  updated_at: true,
  company_id: true,
  is_active: true,
  status: true,
  dailyreportrows: { select: { status: true } },
} as const;

type DailyReportRow = {
  date: Date;
  creation_date: Date | null;
};

function serializeDailyReport<T extends DailyReportRow>(report: T) {
  return {
    ...report,
    date: toIsoDate(report.date),
    creation_date: report.creation_date ? toIsoDate(report.creation_date) : null,
  };
}

/** Partes diarios ya existentes para las fechas dadas (empresa activa). */
export async function checkDailyReportExists(dates: string[]) {
  if (!dates.length) return [];

  try {
    const companyId = await getActiveCompanyId();

    const reports = await prisma.dailyreport.findMany({
      where: {
        company_id: companyId,
        date: { in: dates.map((date) => moment.utc(date, 'YYYY-MM-DD').toDate()) },
      },
      select: DAILY_REPORT_SELECT,
    });

    return reports.map(serializeDailyReport);
  } catch (error) {
    logger.error('Error al verificar los partes diarios existentes', { data: { error, dates } });
    return [];
  }
}
