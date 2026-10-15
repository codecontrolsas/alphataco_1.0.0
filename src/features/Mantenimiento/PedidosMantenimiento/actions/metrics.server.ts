'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { getResourceKindLabel, getResourceLabel } from '../../shared/maintenance-resource';
import type { PendingAttentionKey } from '../constants';
import {
  CONFIRMED_LIST_STATUS,
  PENDING_LIST_DEFAULT_STATUS,
  confirmedAttentionCondition,
  pendingAttentionCondition,
  resolveOrderListScope,
  scopeConditions,
} from '../lib/order-list-shared';

const logger = new Logger('PedidosMantenimiento/metrics');

const MODULE_SLUG = 'mantenimiento';

/** Cuántos pedidos con fecha vencida se nombran en la banda de "Por Ingresar" (el resto va como "y N más"). */
const CONFIRMED_ATTENTION_ROWS = 3;

/**
 * Métricas de "Por Programar". Cada cifra usa el MISMO perímetro y el MISMO estado que la tabla sin filtros
 * (empresa, tipos ocultos, supervisor, `pending_scheduling`) y, las de atención, la misma condición que el filtro
 * virtual `attention` del listado: al tocar una tarjeta la tabla muestra exactamente tantas filas como ella dice.
 *
 * Nunca lanza: si falla (o no hay permiso) devuelve `null` y la pantalla muestra "—" (jamás un 0 inventado).
 */
export async function getPendingOrderMetrics() {
  try {
    if (!(await checkPermissionServer(MODULE_SLUG, 'pedidos_pendientes', 'view'))) {
      logger.warn('Métricas de pedidos por programar pedidas sin permiso de lectura');
      return null;
    }

    const companyId = await getActiveCompanyId();
    const scope = await resolveOrderListScope(companyId);
    const base = [...scopeConditions(scope), { status: PENDING_LIST_DEFAULT_STATUS }];
    const now = new Date();

    const countWith = (key: PendingAttentionKey | null) =>
      prisma.maintenance_orders.count({
        where: { AND: key ? [...base, pendingAttentionCondition(key, now)] : base },
      });

    const [total, overdue, dateRejected, preventive] = await Promise.all([
      countWith(null),
      countWith('overdue'),
      countWith('date_rejected'),
      countWith('preventive'),
    ]);

    return { total, overdue, dateRejected, preventive };
  } catch (error) {
    logger.error('Error al calcular las métricas de pedidos por programar', { data: { error } });
    return null;
  }
}

/**
 * Banda de atención de "Por Ingresar": pedidos cuya fecha planificada ya pasó sin que el equipo ingresara.
 * Devuelve el total (misma condición que el filtro `attention=past_date` de la tabla) y los más atrasados, con
 * lo mínimo que dibuja la banda. Nunca lanza: `null` si falla o no hay permiso (la banda no se muestra).
 */
export async function getConfirmedOrderAttention() {
  try {
    if (!(await checkPermissionServer(MODULE_SLUG, 'pedidos_confirmados', 'view'))) {
      logger.warn('Atención de pedidos por ingresar pedida sin permiso de lectura');
      return null;
    }

    const companyId = await getActiveCompanyId();
    const scope = await resolveOrderListScope(companyId);
    const where = {
      AND: [...scopeConditions(scope), { status: CONFIRMED_LIST_STATUS }, confirmedAttentionCondition('past_date')],
    };

    const [pastDateTotal, rows] = await Promise.all([
      prisma.maintenance_orders.count({ where }),
      prisma.maintenance_orders.findMany({
        where,
        // El más atrasado primero; el id desempata para que el orden no cambie entre cargas
        orderBy: [{ scheduled_date: 'asc' }, { id: 'asc' }],
        take: CONFIRMED_ATTENTION_ROWS,
        select: {
          id: true,
          scheduled_date: true,
          description: true,
          vehicles: { select: { id: true, domain: true, serie: true, intern_number: true } },
          other_equipment: { select: { id: true, serial_number: true, intern_number: true } },
          maintenance_requests: { select: { description: true } },
        },
      }),
    ]);

    return {
      pastDateTotal,
      // Solo lo que dibuja la banda: textos y la fecha como `YYYY-MM-DD` (es @db.Date, sin hora)
      rows: rows.flatMap((row) =>
        row.scheduled_date
          ? [
              {
                id: row.id,
                resource: getResourceLabel(row),
                kindLabel: getResourceKindLabel(row),
                scheduledDay: row.scheduled_date.toISOString().slice(0, 10),
                description: row.description ?? row.maintenance_requests?.description ?? null,
              },
            ]
          : []
      ),
    };
  } catch (error) {
    logger.error('Error al calcular la atención de pedidos por ingresar', { data: { error } });
    return null;
  }
}
