'use server';

import { argentinaDayStart } from '@/features/Dashboard/Principal/lib/dashboard-dates';
import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';

const logger = new Logger('Dashboard/Estadisticas/SalaDeControl/PreparteKpi');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PreparteKpiRow = {
  date: string; // YYYY-MM-DD
  customerId: string;
  customerName: string;
  pendiente: number;
  confirmado: number;
  rechazado: number;
  cancelado: number;
  otros: number; // reprogramado + vencido
  total: number;
};

export type PreparteKpiData = {
  rows: PreparteKpiRow[];
  customers: { id: string; name: string }[];
};

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------

export async function getPreparteKpiData(): Promise<PreparteKpiData> {
  await requireDashboardView('desvios');
  // "Hoy" en hora argentina; el corte del período es la medianoche argentina (no la UTC)
  const since = moment.utc(argentinaDate()).subtract(12, 'months').startOf('month').format('YYYY-MM-DD');
  const sinceInstant = argentinaDayStart(since);

  logger.debug('Fetching preparte KPI data', { data: { since } });

  try {
    const companyId = await getActiveCompanyId();

    /**
     * Agregado en Postgres (antes se traían 12 meses de partes a Node para contarlos).
     * El día es el ARGENTINO de `created_at`: un pedido cargado a las 22 h cae en su día
     * y no en el siguiente (UTC). Mismo alcance que el listado de Preparte: las filas legacy
     * sin company_id se consideran de la empresa. `otros` = reprogramado + vencido + sin estado.
     */
    const rawRows = await prisma.$queryRaw<
      {
        date: string;
        customer_id: string;
        customer_name: string | null;
        pendiente: number;
        confirmado: number;
        rechazado: number;
        cancelado: number;
        otros: number;
        total: number;
      }[]
    >`
      SELECT
        to_char((p.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM-DD') AS date,
        c.id::text AS customer_id,
        c.name AS customer_name,
        COUNT(*) FILTER (WHERE p.status = 'pendiente')::int AS pendiente,
        COUNT(*) FILTER (WHERE p.status = 'confirmado')::int AS confirmado,
        COUNT(*) FILTER (WHERE p.status = 'rechazado')::int AS rechazado,
        COUNT(*) FILTER (WHERE p.status = 'cancelado')::int AS cancelado,
        COUNT(*) FILTER (WHERE p.status IS NULL OR p.status NOT IN ('pendiente', 'confirmado', 'rechazado', 'cancelado'))::int AS otros,
        COUNT(*)::int AS total
      FROM preparte p
      JOIN customers c ON c.id = p.cliente_id
      WHERE p.created_at >= ${sinceInstant}
        AND (p.company_id = ${companyId}::uuid OR p.company_id IS NULL)
      GROUP BY 1, 2, 3
      ORDER BY 1
    `;

    const customerMap = new Map<string, string>();
    const rows: PreparteKpiRow[] = rawRows.map((row) => {
      const customerName = row.customer_name ?? 'Sin cliente';
      customerMap.set(row.customer_id, customerName);
      return {
        date: row.date,
        customerId: row.customer_id,
        customerName,
        pendiente: row.pendiente,
        confirmado: row.confirmado,
        rechazado: row.rechazado,
        cancelado: row.cancelado,
        otros: row.otros,
        total: row.total,
      };
    });

    const customers = Array.from(customerMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    logger.debug('Preparte KPI data fetched', {
      data: {
        totalRecords: rows.reduce((sum, row) => sum + row.total, 0),
        aggregatedRows: rows.length,
        customerCount: customers.length,
      },
    });

    return { rows, customers };
  } catch (error) {
    logger.error('Error fetching preparte KPI data', { data: { error } });
    throw error;
  }
}
