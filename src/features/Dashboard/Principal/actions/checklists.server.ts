'use server';

import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { getStartOfOperationMonth } from '../lib/dashboard-dates';

const logger = new Logger('features/Dashboard/Principal/checklists');

/**
 * Equipos sin checklist (ticket 685).
 *
 * Mismo universo que la tabla de Equipos (`type_of_vehicle = 1`):
 * - `historicalCount`: nunca se les hizo un checklist.
 * - `monthCount`: no tienen ninguno dentro del mes en curso.
 *
 * El corte del mes queda aislado en `getStartOfOperationMonth` para poder cambiarlo a
 * "mes anterior" sin tocar la query (posible cambio futuro, según la reunión del ticket).
 */
export async function getChecklistMissingIndicator() {
  await requireDashboardView('principal');
  logger.debug('Obteniendo indicador de equipos sin checklist');

  try {
    const companyId = await getActiveCompanyId();
    const startOfMonth = getStartOfOperationMonth();

    const baseWhere = withCompany({ is_active: true, type_of_vehicle: 1 }, companyId);

    const [historicalCount, monthCount] = await Promise.all([
      prisma.vehicles.count({ where: { ...baseWhere, checklist_answers: { none: {} } } }),
      prisma.vehicles.count({
        where: { ...baseWhere, checklist_answers: { none: { created_at: { gte: startOfMonth } } } },
      }),
    ]);

    return { historicalCount, monthCount };
  } catch (error) {
    logger.error('Error al obtener indicador de equipos sin checklist', { data: { error } });
    // Sin dato no hay 0: un cero se leería como "todos los equipos tienen checklist".
    throw error;
  }
}

export type ChecklistMissingIndicatorData = Awaited<ReturnType<typeof getChecklistMissingIndicator>>;
