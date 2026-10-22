'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { requestAttentionCondition, type RequestAttentionKey } from './request-attention';
import { requestScopeConditions, resolveRequestListScope } from './request-scope';

const logger = new Logger('SolicitudesMantenimiento/metrics');

/**
 * Métricas de la lista "Validar Solicitud". Cada cifra usa el MISMO perímetro que la tabla (empresa, solo
 * pendientes, tipos ocultos, supervisor) y, las de atención, la misma condición que el filtro `attention`
 * del listado: al tocar una tarjeta la tabla muestra exactamente tantas filas como dice la tarjeta.
 *
 * Nunca lanza: si falla devuelve `null` y la pantalla muestra "—" (jamás un 0 inventado).
 */
export async function getMaintenanceRequestMetrics() {
  try {
    if (!(await checkPermissionServer('mantenimiento', 'maintenance_requests', 'view'))) {
      logger.warn('Métricas de solicitudes pedidas sin permiso de lectura');
      return null;
    }

    const companyId = await getActiveCompanyId();
    const scope = await resolveRequestListScope(companyId);
    const base = requestScopeConditions(scope);
    const now = new Date();

    const countWith = (key: RequestAttentionKey | null) =>
      prisma.maintenance_requests.count({
        where: { AND: key ? [...base, requestAttentionCondition(key, now)] : base },
      });

    const [pending, critical, overdue, preventive] = await Promise.all([
      countWith(null),
      countWith('critical'),
      countWith('overdue'),
      countWith('preventive'),
    ]);

    return { pending, critical, overdue, preventive };
  } catch (error) {
    logger.error('Error al calcular las métricas de solicitudes por validar', { data: { error } });
    return null;
  }
}
