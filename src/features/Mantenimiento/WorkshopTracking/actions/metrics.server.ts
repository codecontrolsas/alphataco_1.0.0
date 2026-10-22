'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import {
  assembleOrdersWhere,
  resolveOrderListScope,
  scopeConditions,
} from '../../PedidosMantenimiento/lib/order-list-shared';
import { getResourceLabel } from '../../shared/maintenance-resource';
import {
  recentTrackingRejectionCondition,
  trackingAttentionCondition,
  type TrackingAttentionKey,
} from '../attention-conditions';
import { DEFAULT_TRACKING_STATUSES } from '../statuses';

const logger = new Logger('WorkshopTracking/metrics.server');

const MODULE_SLUG = 'mantenimiento';
/** Tab "Seguimiento en Taller" (paso 2 del pipeline de Operaciones). */
const TAB_SLUG = 'seguimiento_taller';

/** Pedidos rechazados por el taller que se nombran en la banda de Atención. */
const REJECTED_PREVIEW_LIMIT = 3;

/**
 * Cifras de las tarjetas y la banda de Atención de Seguimiento.
 *
 * Cada número usa el MISMO perímetro y la MISMA condición que la lista que filtra (D-4):
 * los estados se cuentan sobre `DEFAULT_TRACKING_STATUSES` y la antigüedad con
 * `trackingAttentionCondition`, la misma función que aplica el filtro virtual `attention`.
 *
 * Nunca rechaza: devuelve `null` si no pudo contar, y la tarjeta muestra "—" en vez de un 0 inventado.
 * Es la `queryFn` de React Query y también la promesa que arranca el servidor junto con la tabla.
 */
export async function getWorkshopTrackingMetrics() {
  try {
    if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) return null;

    const companyId = await getActiveCompanyId();
    const scope = scopeConditions(await resolveOrderListScope(companyId));
    const whereWith = (...extra: Record<string, unknown>[]) => assembleOrdersWhere({ scope, extra });
    const attentionCount = (key: TrackingAttentionKey) =>
      prisma.maintenance_orders.count({ where: whereWith(trackingAttentionCondition(key)) });

    const [byStatusRows, overdue, pastDate, recentRejected, workshopRejected] = await Promise.all([
      prisma.maintenance_orders.groupBy({
        by: ['status'],
        where: whereWith({ status: { in: DEFAULT_TRACKING_STATUSES } }),
        _count: { _all: true },
      }),
      attentionCount('overdue'),
      attentionCount('past_date'),
      // D-5: rechazados por el taller en los últimos `recentRejectionDays` días
      prisma.maintenance_orders.count({ where: whereWith(recentTrackingRejectionCondition()) }),
      prisma.maintenance_orders.findMany({
        where: whereWith({ status: 'workshop_rejected' }),
        orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
        take: REJECTED_PREVIEW_LIMIT,
        select: {
          id: true,
          order_number: true,
          vehicles: { select: { domain: true, serie: true, intern_number: true } },
          other_equipment: { select: { serial_number: true, intern_number: true } },
        },
      }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of byStatusRows) byStatus[row.status] = row._count._all;

    return {
      byStatus,
      overdue,
      pastDate,
      recentRejected,
      workshopRejected: workshopRejected.map((order) => ({
        id: order.id,
        orderNumber: order.order_number,
        resource: getResourceLabel(order),
      })),
    };
  } catch (error) {
    logger.error('Error al obtener las métricas de seguimiento de taller', { data: { error } });
    return null;
  }
}
