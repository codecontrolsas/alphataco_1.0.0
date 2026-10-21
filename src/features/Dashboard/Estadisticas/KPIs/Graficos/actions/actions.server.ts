'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { assertCanViewKpiCharts } from '../lib/kpi-permissions.server';
import type { KpiCode } from './getKpiChartData';

const logger = new Logger('features/Dashboard/KPIs/Graficos');

const KPI_CODES: KpiCode[] = ['KPI-0001', 'KPI-0002', 'KPI-0003', 'KPI-0004', 'KPI-0005', 'KPI-0006'];

// Descripciones cortas para cada KPI (no requieren query a BD)
const KPI_DESCRIPTION_MAP: Record<KpiCode, string> = {
  'KPI-0001': 'Porcentaje de empleados ausentes sobre el total de empleados activos (AD = TA / TE × 100)',
  'KPI-0002':
    'Porcentaje de personal asignado a movimientos internos sobre el total de personal apto (PMI = TMI / TPA × 100)',
  'KPI-0003':
    'Porcentaje de personal productivo asignado a clientes sobre el personal disponible (PP = TPC / (TPA - TMI) × 100)',
  'KPI-0004': 'Porcentaje de equipos no operativos sobre el total de equipos aptos (EDO = ENO / EA × 100)',
  'KPI-0005':
    'Porcentaje de equipos asignados a movimientos internos sobre equipos operativos (EMI = EAMI / EOA × 100)',
  'KPI-0006':
    'Porcentaje de equipos operativos asignados a clientes sobre equipos disponibles (EOC = TEOC / TEOA × 100)',
};

/**
 * Metadata (nombre, número, descripción) de los 6 KPIs en una sola query.
 *
 * Perímetro: la empresa sale de `getActiveCompanyId()`. Antes esta action leía a mano el
 * claim `app_metadata.company` del JWT: además de saltearse el único punto de entrada,
 * devolvía vacío en las sesiones que todavía no tienen el claim.
 */
export async function getAllKpisMetadata() {
  logger.debug('Obteniendo metadata de todos los KPIs');
  await assertCanViewKpiCharts();

  try {
    const companyId = await getActiveCompanyId();

    const kpis = await prisma.kpis.findMany({
      where: withCompany({ is_active: true, code: { in: KPI_CODES } }, companyId),
      select: {
        code: true,
        name: true,
        number: true,
      },
      orderBy: { code: 'asc' },
    });

    return kpis.map((kpi) => ({
      code: kpi.code as KpiCode,
      name: kpi.name,
      number: kpi.number ? Number(kpi.number) : 0,
      description: KPI_DESCRIPTION_MAP[kpi.code as KpiCode] || 'Evolución del indicador',
    }));
  } catch (error) {
    logger.error('Error al obtener metadata de KPIs', { data: { error } });
    return [];
  }
}
