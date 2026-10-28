'use server';

import { resolveVehicleTireTemplateId } from '@/features/Mantenimiento/Gomeria/shared/resolve-template';
import { requireResourceAccess } from '@/features/Mantenimiento/shared/resource-access.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';

const logger = new Logger('features/Mantenimiento/Gomeria/Ordenes/tire-service-qr');

/**
 * Contexto de gomería del equipo escaneado por el QR.
 *
 * La plantilla efectiva de cubiertas es el override del vehículo o, si no tiene, la de su
 * subtipo. Devuelve `null` si el equipo no existe o no tiene empresa.
 *
 * La empresa NO viaja al cliente: cada action del asistente la vuelve a derivar del
 * vehículo o de la orden en el servidor, así que acá sólo se usa como comprobación de que
 * el equipo es utilizable.
 */
export async function fetchTireServiceContextForEquipment(equipmentId: string) {
  try {
    // Mismo criterio que el resto de las acciones del QR: operario de la empresa del equipo o permiso del dashboard.
    await requireResourceAccess('vehicle', equipmentId, { modules: ['gomeria'] });
    const vehicle = await prisma.vehicles.findUnique({
      where: { id: equipmentId },
      select: {
        company_id: true,
        tire_template_id: true,
        sub_type: { select: { tire_template_id: true } },
      },
    });

    if (!vehicle?.company_id) return null;

    return {
      tireTemplateId: resolveVehicleTireTemplateId(vehicle),
    };
  } catch (error) {
    logger.error('Error al obtener el contexto de gomería del equipo', { data: { error, equipmentId } });
    return null;
  }
}
