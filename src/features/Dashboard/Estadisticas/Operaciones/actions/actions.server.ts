'use server';

import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';

const logger = new Logger('Dashboard/Estadisticas/Operaciones');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AggregatedChartRow = {
  date: string;
  customerId: string;
  customerName: string;
  mensual: number;
  adicional: number;
  /**
   * Centros de costo de los equipos afectados al parte. Un parte puede involucrar
   * equipos de varios centros; la fila agrupa solo partes con el MISMO conjunto,
   * de modo que al filtrar cada parte se cuenta una sola vez. Vacío = sin asignar.
   */
  costCenterIds: string[];
};

export type OperationsChartData = {
  rows: AggregatedChartRow[];
  customers: { id: string; name: string }[];
  costCenters: { id: string; name: string }[];
};

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------

export async function getOperationsChartData(): Promise<OperationsChartData> {
  await requireDashboardView('operaciones');
  const companyId = await getActiveCompanyId();
  // "Hoy" en hora argentina: el servidor corre en UTC y entre las 21 y las 24 h ya estaría en el día siguiente
  const since = moment.utc(argentinaDate()).subtract(12, 'months').startOf('month').format('YYYY-MM-DD');

  logger.debug('Fetching operations chart data', { data: { companyId, since } });

  try {
    /**
     * La agregación corre en Postgres: resolver el centro de costo exige recorrer los
     * equipos de cada parte (~18k partes), y traer esas relaciones por el ORM para agrupar
     * en Node llevaba el render a ~7s. Agrupado en la BD baja a milisegundos.
     *
     * Cada parte aporta a un único bucket (fecha + cliente + conjunto exacto de centros),
     * de modo que al filtrar por centro ningún parte se cuenta dos veces.
     * Solo vehicles: se verificó que ningún parte obtiene su centro exclusivamente desde
     * other_equipment, por lo que sumarlo solo agregaría trabajo a la query.
     */
    const rawRows = await prisma.$queryRaw<
      {
        date: string;
        customer_id: string;
        customer_name: string | null;
        cost_center_key: string;
        mensual: number;
        adicional: number;
      }[]
    >`
      WITH row_cost_center_pairs AS (
        -- Agrupar los pares (parte, centro) antes de concatenar evita el DISTINCT
        -- dentro de string_agg, que es la parte cara de la agregación
        SELECT der.daily_report_row_id AS row_id, v.cost_center_id
        FROM dailyreportequipmentrelations der
        -- Acotado a la empresa y al rango pedido DENTRO del CTE: sin esto recorría todas las
        -- relaciones parte-equipo históricas de todas las empresas (mismos filtros que la consulta final)
        JOIN dailyreportrows pr ON pr.id = der.daily_report_row_id AND pr.customer_id IS NOT NULL
        JOIN dailyreport pd ON pd.id = pr.daily_report_id
          AND pd.company_id = ${companyId}::uuid
          AND pd.date >= ${since}::date
          AND pd.is_active = true
        JOIN vehicles v ON v.id = der.equipment_id AND v.cost_center_id IS NOT NULL
        GROUP BY 1, 2
      ),
      row_cost_center AS (
        SELECT row_id, string_agg(cost_center_id::text, ',' ORDER BY cost_center_id::text) AS cost_center_key
        FROM row_cost_center_pairs
        GROUP BY row_id
      )
      SELECT
        to_char(dr.date, 'YYYY-MM-DD') AS date,
        drr.customer_id::text AS customer_id,
        c.name AS customer_name,
        COALESCE(rcc.cost_center_key, '') AS cost_center_key,
        -- Comparar contra el enum directamente: castear a text lo evalúa por fila
        COUNT(*) FILTER (WHERE drr.type_service = 'mensual')::int AS mensual,
        COUNT(*) FILTER (WHERE drr.type_service IN ('adicional', 'adicional_permanente'))::int AS adicional
      FROM dailyreportrows drr
      JOIN dailyreport dr ON dr.id = drr.daily_report_id
      JOIN customers c ON c.id = drr.customer_id
      LEFT JOIN row_cost_center rcc ON rcc.row_id = drr.id
      WHERE dr.company_id = ${companyId}::uuid
        AND dr.date >= ${since}::date
        AND dr.is_active = true
        AND drr.customer_id IS NOT NULL
      GROUP BY 1, 2, 3, 4
      ORDER BY 1
    `;

    const customerMap = new Map<string, string>();
    const presentCostCenterIds = new Set<string>();
    const aggregatedRows: AggregatedChartRow[] = [];

    for (const row of rawRows) {
      // Los partes sin tipo de servicio no suman a ningún contador: se descartan
      if (row.mensual === 0 && row.adicional === 0) continue;

      const customerName = row.customer_name ?? 'Sin cliente';
      customerMap.set(row.customer_id, customerName);

      const costCenterIds = row.cost_center_key ? row.cost_center_key.split(',') : [];
      for (const id of costCenterIds) presentCostCenterIds.add(id);

      aggregatedRows.push({
        date: row.date,
        customerId: row.customer_id,
        customerName,
        mensual: row.mensual,
        adicional: row.adicional,
        costCenterIds,
      });
    }

    const customers = Array.from(customerMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Solo los centros con actividad en el período (incluye inactivos que aún operan)
    const costCenters =
      presentCostCenterIds.size > 0
        ? await prisma.cost_center.findMany({
            where: { id: { in: Array.from(presentCostCenterIds) } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];

    logger.debug('Operations chart data fetched', {
      data: { rowCount: aggregatedRows.length, customerCount: customers.length, costCenterCount: costCenters.length },
    });

    return { rows: aggregatedRows, customers, costCenters };
  } catch (error) {
    logger.error('Error fetching operations chart data', { data: { error } });
    throw error;
  }
}
