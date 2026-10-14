'use server';

import { requireGomeriaPermission } from '@/features/Mantenimiento/Gomeria/shared/access.server';
import { parseInput, uuidSchema } from '@/features/Mantenimiento/Gomeria/shared/validation';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';

const logger = new Logger('features/Mantenimiento/Gomeria/Ordenes');

// ============================================================================
// DETAIL QUERY
// ============================================================================

/**
 * Detalle de una orden para el dashboard: la empresa sale de la sesión y el id de la ruta
 * sólo resuelve si la orden es de esa empresa (antes cualquier uuid de orden era legible).
 */
export async function getServiceOrderById(id: string) {
  logger.debug('Fetching service order by id', { data: { id } });

  try {
    const companyId = await requireGomeriaPermission('ordenes_gomeria', 'view');
    const order = await prisma.tire_service_orders.findFirst({
      where: { id: parseInput(uuidSchema, id), company_id: companyId },
      include: {
        vehicle: { select: { id: true, domain: true, intern_number: true, sub_type: { select: { name: true } } } },
        trailer: { select: { id: true, domain: true, intern_number: true, sub_type: { select: { name: true } } } },
        creator: { select: { id: true, fullname: true } },
        items: {
          select: {
            id: true,
            position_number: true,
            action: true,
            old_tire_destination: true,
            tread_depth: true,
            pressure_start: true,
            pressure_end: true,
            observations: true,
            created_at: true,
            tire: {
              select: {
                id: true,
                serial_number: true,
                status: true,
                brand: { select: { id: true, name: true } },
                tire_type: { select: { id: true, size: true, tread_type: true } },
              },
            },
            new_tire: {
              select: {
                id: true,
                serial_number: true,
                brand: { select: { id: true, name: true } },
                tire_type: { select: { id: true, size: true, tread_type: true } },
              },
            },
          },
          orderBy: { position_number: 'asc' },
        },
      },
    });

    return order;
  } catch (error) {
    logger.error('Error fetching service order by id', { data: { error, id } });
    throw error;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type ServiceOrderDetail = Awaited<ReturnType<typeof getServiceOrderById>>;
