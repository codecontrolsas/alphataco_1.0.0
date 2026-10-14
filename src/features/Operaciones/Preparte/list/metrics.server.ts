'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('Operaciones/Preparte/metrics.server');

/**
 * Resumen para las tarjetas del gestor de pedidos: total y cantidad por estado.
 * Mismo universo que antes contaban las tarjetas una por una (empresa activa + pedidos viejos sin
 * `company_id`), ahora en una sola consulta agrupada.
 */
export async function getPreparteStatusMetrics() {
  const companyId = await getActiveCompanyId();

  try {
    const rows = await prisma.preparte.groupBy({
      by: ['status'],
      where: { OR: [{ company_id: companyId }, { company_id: null }] },
      _count: { _all: true },
    });

    const byStatus: Partial<Record<NonNullable<(typeof rows)[number]['status']>, number>> = {};
    let total = 0;
    for (const row of rows) {
      total += row._count._all;
      if (row.status) byStatus[row.status] = row._count._all;
    }

    return { total, byStatus };
  } catch (error) {
    logger.error('Error al obtener las métricas de pedidos', { data: { error } });
    throw error;
  }
}
