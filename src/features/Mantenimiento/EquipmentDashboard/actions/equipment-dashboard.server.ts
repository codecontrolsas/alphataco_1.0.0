'use server';

import { requireResourceAccess } from '@/features/Mantenimiento/shared/resource-access.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';

const logger = new Logger('features/Mantenimiento/EquipmentDashboard/equipment');

/**
 * Datos del equipo escaneado por el QR, para la cabecera del dashboard de mantenimiento.
 *
 * El `equipmentId` llega por la ruta. La empresa la define el propio vehículo (este flujo
 * corre sin empresa activa), pero quien llama tiene que probar que pertenece a ella
 * (`requireResourceAccess`): operario del QR con legajo de esa empresa, o usuario del
 * dashboard con la empresa activa. Sin acceso (o equipo sin empresa) devuelve `null`.
 */
export async function fetchEquipmentForDashboard(equipmentId: string) {
  try {
    await requireResourceAccess('vehicle', equipmentId);

    const vehicle = await prisma.vehicles.findUnique({
      where: { id: equipmentId },
      select: {
        id: true,
        domain: true,
        serie: true,
        intern_number: true,
        picture: true,
        year: true,
        kilometer: true,
        engine_hours: true,
        condition: true,
        company_id: true,
        is_active: true,
        tire_template_id: true,
        brand_vehicles: { select: { name: true } },
        model_vehicles: { select: { name: true } },
        type_vehicles_typeTotype: { select: { id: true, name: true } },
        sub_type: { select: { id: true, name: true, tire_template_id: true } },
      },
    });

    if (!vehicle?.company_id) return null;

    return {
      id: vehicle.id,
      domain: vehicle.domain,
      serie: vehicle.serie,
      intern_number: vehicle.intern_number,
      picture: vehicle.picture,
      brand: vehicle.brand_vehicles?.name || '',
      model: vehicle.model_vehicles?.name || '',
      year: vehicle.year || '',
      kilometer: vehicle.kilometer || '0',
      engine_hours: vehicle.engine_hours ?? null,
      condition: (vehicle.condition as string | null) || 'operativo',
      type: vehicle.type_vehicles_typeTotype?.name || '',
      sub_type: vehicle.sub_type?.name || '',
      is_active: vehicle.is_active ?? true,
      // El override del vehículo manda sobre la plantilla del subtipo.
      tire_template_id: vehicle.tire_template_id ?? vehicle.sub_type?.tire_template_id ?? null,
    };
  } catch (error) {
    logger.error('Error al obtener el equipo del dashboard de mantenimiento', { data: { error, equipmentId } });
    return null;
  }
}
