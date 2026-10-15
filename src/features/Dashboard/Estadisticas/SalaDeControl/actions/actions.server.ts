'use server';

import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';

const logger = new Logger('Dashboard/Estadisticas/SalaDeControl');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Los cinco contadores que reporta el mail nocturno de desvios.
 *
 * `null` significa "no medible para esa fecha", y es distinto de 0. Las tres
 * primeras series solo existen desde que el snapshot corre en vivo: para atras
 * no se pueden reconstruir porque miden errores de carga que se corrigen sobre
 * las tablas maestras, y una vez corregidos no queda rastro. Los duplicados si
 * estan siempre (dependen solo del parte, que es inmutable).
 */
export type DeviationTotals = {
  rows_with_deviations: number | null;
  employee_deviations: number | null;
  equipment_deviations: number | null;
  duplicated_employees: number;
  duplicated_equipment: number;
};

export type DeviationCustomerBreakdown = DeviationTotals & {
  customer_id: string | null;
  customer_name: string;
};

/**
 * Forma del jsonb `metrics` que escribe `get_daily_report_deviations_indicator`.
 * El jsonb no es tipable por Prisma, asi que se declara aca y se castea al leer.
 */
type DeviationMetrics = {
  totals: DeviationTotals;
  employee_breakdown: {
    unassigned_to_client: number;
    no_diagram: number;
    non_work_day: number;
    duplicated: number;
  };
  equipment_breakdown: {
    unassigned_to_client: number;
    non_operative_condition: number;
    duplicated: number;
  };
  by_customer: DeviationCustomerBreakdown[];
  meta: {
    report_date: string;
    captured_live: boolean;
  };
};

export type DeviationDay = {
  date: string;
  totals: DeviationTotals;
  byCustomer: DeviationCustomerBreakdown[];
  /**
   * true solo para los dias capturados por el cron nocturno, los unicos con los
   * cinco indicadores. En los dias del backfill las tres series de desvios
   * viajan en null y solo los duplicados tienen valor.
   */
  capturedLive: boolean;
};

export type DeviationsChartData = {
  days: DeviationDay[];
  customers: { id: string; name: string }[];
  /** Primer dia con los cinco indicadores, o null si todavia no hay ninguno. */
  firstLiveDate: string | null;
};

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------

/**
 * Lee los snapshots diarios de desvios del parte diario de los ultimos 12 meses.
 *
 * Los datos vienen ya congelados por el cron nocturno (o por el backfill), no se
 * recalculan: ese es justamente el punto del ticket 578. Recalcularlos contra el
 * estado actual de la base haria que el historico cambie solo con el tiempo.
 */
export async function getDeviationsChartData(): Promise<DeviationsChartData> {
  await requireDashboardView('desvios');
  const companyId = await getActiveCompanyId();
  // 24 meses: la vista mensual ya abarca 12, y navegar hacia atras desde ahi
  // dejaria el grafico vacio si el fetch cortara justo en ese limite.
  // "Hoy" en hora argentina; `snapshot_date` es @db.Date (medianoche UTC), por eso el corte también es UTC
  const since = moment.utc(argentinaDate()).subtract(24, 'months').startOf('month').toDate();

  logger.debug('Fetching deviations chart data', { data: { companyId } });

  try {
    const snapshots = await prisma.daily_indicators.findMany({
      where: {
        company_id: companyId,
        source: 'get_daily_report_deviations_indicator',
        snapshot_date: { gte: since },
      },
      select: { snapshot_date: true, metrics: true },
      orderBy: { snapshot_date: 'asc' },
    });

    const customerMap = new Map<string, string>();
    const days: DeviationDay[] = [];
    let firstLiveDate: string | null = null;

    for (const snapshot of snapshots) {
      const metrics = snapshot.metrics as unknown as DeviationMetrics | null;
      if (!metrics?.totals) continue;

      const byCustomer = metrics.by_customer ?? [];
      for (const entry of byCustomer) {
        if (entry.customer_id) customerMap.set(entry.customer_id, entry.customer_name);
      }

      const date = moment.utc(snapshot.snapshot_date).format('YYYY-MM-DD');
      const capturedLive = metrics.meta?.captured_live === true;

      if (capturedLive && (firstLiveDate === null || date < firstLiveDate)) {
        firstLiveDate = date;
      }

      // Los desgloses por tipo (employee_breakdown / equipment_breakdown) se
      // guardan en el snapshot pero no se envian al cliente: hoy no los consume
      // ninguna pantalla y viajarian enteros en el payload de los ~730 dias.
      days.push({
        date,
        totals: metrics.totals,
        byCustomer,
        capturedLive,
      });
    }

    const customers = Array.from(customerMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    logger.debug('Deviations chart data fetched', {
      data: { dayCount: days.length, customerCount: customers.length, firstLiveDate },
    });

    return { days, customers, firstLiveDate };
  } catch (error) {
    logger.error('Error al obtener los desvios del parte diario', { data: { error, companyId } });
    throw error;
  }
}
