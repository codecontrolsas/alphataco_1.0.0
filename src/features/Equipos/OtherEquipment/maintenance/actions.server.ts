'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('OtherEquipment/maintenance/actions');

/** Tope de órdenes del historial de un equipamiento (las más recientes primero). */
const MAX_ORDERS = 50;

/**
 * Historial de mantenimiento de un EQUIPAMIENTO (ticket 596).
 *
 * Espeja a `getMaintenanceOrdersForEquipment` de los vehículos, pero filtrando
 * por `other_equipment_id` y con un select acotado a lo que muestra la tabla.
 *
 * Acotado a la empresa activa (`maintenance_orders.company_id`) y al permiso `view` de la
 * pestaña Mantenimiento (`mantenimiento/ordenes_mantenimiento`, la misma que muestra la UI).
 * Devuelve las últimas 50 órdenes.
 *
 * NO atrapa el error: si la consulta falla tiene que propagarse para que la UI
 * pueda distinguir "no se pudo cargar" de "no hay órdenes". Devolver `[]` en el
 * catch haría que la pantalla afirme que el equipamiento nunca tuvo
 * mantenimiento, que es justo lo contrario de lo que pasó.
 */
export async function getMaintenanceOrdersForOtherEquipment(otherEquipmentId: string) {
  logger.debug('Obteniendo historial de mantenimiento del equipamiento', { data: { otherEquipmentId } });
  if (!(await checkPermissionServer('mantenimiento', 'ordenes_mantenimiento', 'view'))) {
    throw new Error('No tenés permiso para ver el historial de mantenimiento');
  }
  const companyId = await getActiveCompanyId();

  try {
    const orders = await prisma.maintenance_orders.findMany({
      where: withCompany({ other_equipment_id: otherEquipmentId }, companyId),
      select: {
        id: true,
        order_number: true,
        status: true,
        created_at: true,
        scheduled_date: true,
        workshop_entry_date: true,
        description: true,
        maintenance_requests: {
          select: { id: true, source: true, preventive_type: true, description: true },
        },
        maintenance_order_items: {
          select: {
            id: true,
            // El texto libre de un item manual llega volcado acá al crear la orden
            description: true,
            types_of_repairs: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
      take: MAX_ORDERS,
    });

    return orders;
  } catch (error) {
    logger.error('Error al obtener historial de mantenimiento del equipamiento', {
      data: { error, otherEquipmentId },
    });
    throw error;
  }
}

export type OtherEquipmentMaintenanceOrders = Awaited<ReturnType<typeof getMaintenanceOrdersForOtherEquipment>>;
export type OtherEquipmentMaintenanceOrder = OtherEquipmentMaintenanceOrders[number];
