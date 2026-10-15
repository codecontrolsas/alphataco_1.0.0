'use server';

import { Logger } from '@/lib/logger';
import { callFunction } from '@/shared/lib/sql';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { z } from 'zod';
import { assertCanViewKpiCharts } from '../lib/kpi-permissions.server';

const logger = new Logger('features/Dashboard/KPIs/Graficos');

export type KpiCode = 'KPI-0001' | 'KPI-0002' | 'KPI-0003' | 'KPI-0004' | 'KPI-0005' | 'KPI-0006';

/**
 * Una fila de `get_kpi_range(p_kpi_code text, p_company_id uuid, p_from_date date, p_to_date date)`
 * → `TABLE(snapshot_date date, indicator numeric, raw_data jsonb)`.
 *
 * `numeric` llega como `Prisma.Decimal`, por eso el `coerce`.
 */
const kpiRangeRowSchema = z.object({
  snapshot_date: z.coerce.date(),
  indicator: z.coerce.number().nullable(),
});

/**
 * `snapshot_date` viene de una columna `date`: se recorta el ISO en vez de formatearla con
 * `moment`, que aplicaría la zona del proceso y correría el eje X un día en un server con
 * `TZ` al oeste de UTC.
 */
function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export interface KpiChartPoint {
  /** `YYYY-MM-DD`: los gráficos lo usan como eje X y para ordenar. */
  snapshot_date: string;
  metrics: { indicator: number };
  created_at: string;
}

/**
 * Serie de un KPI en un rango de fechas.
 *
 * Envuelve la función SQL `get_kpi_range` con `callFunction` (antes era una RPC de PostgREST).
 * Perímetro: la empresa sale de `getActiveCompanyId()`, no de la cookie leída a mano ni de
 * un parámetro del cliente.
 */
export async function getKpiChartData(kpiCode: KpiCode, fromDate: Date, toDate: Date): Promise<KpiChartPoint[]> {
  await assertCanViewKpiCharts();
  try {
    const companyId = await getActiveCompanyId();

    const rows = await callFunction(
      'get_kpi_range',
      [kpiCode, { uuid: companyId }, { date: fromDate }, { date: toDate }],
      z.array(kpiRangeRowSchema.passthrough())
    );

    const createdAt = new Date().toISOString();

    return rows
      .map((row) => ({
        snapshot_date: toDateOnly(row.snapshot_date),
        metrics: { indicator: row.indicator ?? 0 },
        created_at: createdAt,
      }))
      .sort((a, b) => (a.snapshot_date > b.snapshot_date ? 1 : -1));
  } catch (error) {
    logger.error(`Error al obtener la serie de ${kpiCode}`, { data: { error } });
    return [];
  }
}
