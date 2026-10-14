'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('OtherEquipment/list/metrics.server');

/**
 * Resumen para las tarjetas del listado: cuántos equipos activos hay en cada condición.
 * Mismo universo que la tabla (empresa activa, activos) en una sola consulta agrupada.
 */
export async function getOtherEquipmentConditionMetrics() {
  if (!(await checkPermissionServer('equipos', 'others', 'view'))) return {};
  const companyId = await getActiveCompanyId();

  try {
    const rows = await prisma.other_equipment.groupBy({
      by: ['condition'],
      where: { company_id: companyId, is_active: true },
      _count: { _all: true },
    });

    const byCondition: Partial<Record<NonNullable<(typeof rows)[number]['condition']>, number>> = {};
    for (const row of rows) if (row.condition) byCondition[row.condition] = row._count._all;

    return byCondition;
  } catch (error) {
    logger.error('Error al obtener las métricas de equipamiento', { data: { error } });
    throw error;
  }
}
