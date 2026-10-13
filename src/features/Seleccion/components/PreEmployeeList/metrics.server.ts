'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('Seleccion/PreEmployeeList/metrics.server');

/**
 * Resumen para las tarjetas del listado: cuántos candidatos hay en cada etapa del circuito.
 * Una sola consulta agrupada (no un `count` por estado).
 */
export async function getPreEmployeeStatusMetrics() {
  const companyId = await getActiveCompanyId();

  try {
    const rows = await prisma.pre_employees.groupBy({
      by: ['status'],
      where: { company_id: companyId },
      _count: { _all: true },
    });

    const byStatus: Partial<Record<(typeof rows)[number]['status'], number>> = {};
    for (const row of rows) byStatus[row.status] = row._count._all;

    return byStatus;
  } catch (error) {
    logger.error('Error al obtener las métricas de candidatos', { data: { error } });
    throw error;
  }
}
