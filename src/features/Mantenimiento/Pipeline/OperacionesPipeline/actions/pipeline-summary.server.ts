'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { ATTENTION_THRESHOLDS } from '../../../lib/attention-thresholds';
import { assembleOrdersWhere, resolveOrderListScope, scopeConditions } from '../../../PedidosMantenimiento/lib/order-list-shared';
import { requestAttentionCondition } from '../../../SolicitudesMantenimiento/actions/request-attention';
import { requestScopeConditions, resolveRequestListScope } from '../../../SolicitudesMantenimiento/actions/request-scope';
import { hasMaintenancePermission } from '../../../shared/permissions.server';
import { DEFAULT_TRACKING_STATUSES } from '../../../WorkshopTracking/statuses';
import type { PipelineSummary } from '../../types';

const logger = new Logger('Pipeline/Operaciones/summary');

/** Cuenta, y si falla (o no hay permiso) devuelve `null`: la cabecera muestra "—", nunca un 0 inventado. */
async function settle(label: string, task: () => Promise<number | null>): Promise<number | null> {
  try {
    return await task();
  } catch (error) {
    logger.error('No se pudo calcular un contador del pipeline de Operaciones', { data: { error, label } });
    return null;
  }
}

/**
 * Resumen de la cabecera del pipeline de Operaciones: contadores y atención por paso.
 * Es la `queryFn` de React Query del cliente (el servidor la usa también para hidratar).
 *
 * Cada cifra se calcula con el MISMO `where` que la tabla que dice contar (D-4):
 * - `validate`: las solicitudes de "Validar Solicitud" (`request-scope`).
 * - `in_workshop`: las órdenes que Seguimiento muestra por defecto (`DEFAULT_TRACKING_STATUSES`).
 * Atención: `validate` = las que llevan más de 48 h sin validar; `in_workshop` = las rechazadas por el taller.
 * Un contador que falla queda en `null` y se registra; los demás siguen.
 */
export async function getOperacionesPipelineSummary(): Promise<PipelineSummary> {
  const [canViewRequests, canViewTracking] = await Promise.all([
    hasMaintenancePermission('maintenance_requests', 'view'),
    hasMaintenancePermission('seguimiento_taller', 'view'),
  ]);

  const requestsInfo = async () => {
    const companyId = await getActiveCompanyId();
    return requestScopeConditions(await resolveRequestListScope(companyId));
  };

  const ordersWhere = async (statuses: string | string[]) => {
    const companyId = await getActiveCompanyId();
    const scope = await resolveOrderListScope(companyId);
    return assembleOrdersWhere({
      scope: scopeConditions(scope),
      extra: [{ status: Array.isArray(statuses) ? { in: statuses } : statuses }],
    });
  };

  const now = new Date();

  const results = await Promise.allSettled([
    settle('validate', async () => {
      if (!canViewRequests) return null;
      return prisma.maintenance_requests.count({ where: { AND: await requestsInfo() } });
    }),
    settle('validate.overdue', async () => {
      if (!canViewRequests) return null;
      const base = await requestsInfo();
      return prisma.maintenance_requests.count({
        where: { AND: [...base, requestAttentionCondition('overdue', now)] },
      });
    }),
    settle('in_workshop', async () => {
      if (!canViewTracking) return null;
      return prisma.maintenance_orders.count({ where: await ordersWhere(DEFAULT_TRACKING_STATUSES) });
    }),
    settle('in_workshop.rejected', async () => {
      if (!canViewTracking) return null;
      return prisma.maintenance_orders.count({ where: await ordersWhere('workshop_rejected') });
    }),
  ]);

  // `settle` nunca rechaza; el `rejected` solo cubre un fallo imposible de la propia promesa.
  const valueOf = (result: PromiseSettledResult<number | null> | undefined) =>
    result?.status === 'fulfilled' ? result.value : null;
  const validate = valueOf(results[0]);
  const overdue = valueOf(results[1]);
  const inWorkshop = valueOf(results[2]);
  const rejected = valueOf(results[3]);

  return {
    counts: { validate, in_workshop: inWorkshop },
    attention: {
      validate: overdue && overdue > 0 ? `${overdue} con más de ${ATTENTION_THRESHOLDS.requestPendingHours} h` : null,
      in_workshop: rejected && rejected > 0 ? `${rejected} ${rejected === 1 ? 'rechazada' : 'rechazadas'} por taller` : null,
    },
  };
}
