'use server';

import { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import { prisma } from '@/shared/lib/prisma';
import { getResourceLabel } from '../../../shared/maintenance-resource';
import { buildInWorkshopAttentionCondition, type InWorkshopAttentionKey } from '../lib/order-attention';
import { resolveOrdersScope } from '../lib/order-scope';
import { buildOrdersWhere } from '../lib/order-where';

const logger = new Logger('MaintenanceOrders/table/metrics');

/**
 * Tarjetas y banda de atención del paso "En Taller".
 *
 * Cada número se cuenta con el MISMO `where` que el listado: el base es el de la tabla sin filtros
 * (`buildOrdersWhere` con estado vacío: empresa, tipos ocultos y estados por defecto) y cada tarjeta le suma
 * la condición del filtro `attention` que escribe al tocarla. Por eso al filtrar, el total de la tabla es
 * exactamente el número de la tarjeta. Sin cache: tiene que reflejar la lista tras cada mutación.
 *
 * Nunca rechaza: si falla (o no hay permiso) devuelve `null` y las tarjetas muestran "—" en vez de un 0
 * que afirmaría que no hay nada.
 */
export async function getInWorkshopMetrics() {
  try {
    const scope = await resolveOrdersScope();
    if (!scope) return null;

    const now = new Date();
    const base = await buildOrdersWhere(parseSearchParams({}), scope);
    const withCondition = (key: InWorkshopAttentionKey) => ({
      AND: [...base.AND, buildInWorkshopAttentionCondition(key, now)],
    });
    const noWorkOrdersWhere = withCondition('no_work_orders');

    const [total, noWorkOrders, stuck, overdue, longestWaiting] = await Promise.all([
      prisma.maintenance_orders.count({ where: base }),
      prisma.maintenance_orders.count({ where: noWorkOrdersWhere }),
      prisma.maintenance_orders.count({ where: withCondition('stuck') }),
      prisma.maintenance_orders.count({ where: withCondition('overdue') }),
      // Para la banda: la que lleva más tiempo esperando sus OTs (los ingresos sin fecha quedan al final)
      prisma.maintenance_orders.findFirst({
        where: noWorkOrdersWhere,
        orderBy: [{ workshop_entry_date: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          order_number: true,
          description: true,
          workshop_entry_date: true,
          vehicles: { select: { id: true, domain: true, serie: true, intern_number: true } },
          other_equipment: { select: { id: true, serial_number: true, intern_number: true } },
          maintenance_requests: { select: { description: true } },
        },
      }),
    ]);

    return {
      total,
      noWorkOrders,
      stuck,
      overdue,
      // Solo lo que dibuja la banda: texto y fecha en ISO, nada de la fila completa
      longestWaiting: longestWaiting
        ? {
            id: longestWaiting.id,
            orderNumber: longestWaiting.order_number,
            description: longestWaiting.description ?? longestWaiting.maintenance_requests?.description ?? null,
            resource: getResourceLabel(longestWaiting),
            entryDate: longestWaiting.workshop_entry_date?.toISOString() ?? null,
          }
        : null,
    };
  } catch (error) {
    logger.error('Error al contar las métricas de órdenes en taller', { data: { error } });
    return null;
  }
}
