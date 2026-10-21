import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import type { MaintenanceResourceKind } from './maintenance-resource';

export type PrismaLike = Prisma.TransactionClient | typeof prisma;

// Cada helper pide solo los delegados que usa: tipar con el cliente completo hace que `next build` pase el limite de
// instanciacion de tipos (TS2589) al llamarlo con `prisma` y con un `tx`.
type ResourceClient = Pick<Prisma.TransactionClient, 'other_equipment' | 'vehicles'>;
type OrderClient = Pick<Prisma.TransactionClient, 'maintenance_orders'>;

/**
 * Empresa dueña del recurso de mantenimiento (vehículo o equipamiento).
 *
 * Las solicitudes, pedidos, desvíos e ítems heredan la empresa del recurso al que
 * pertenecen, no de la sesión: los flujos QR (`/maintenance/**`) corren sin usuario
 * logueado y aun así tienen que quedar en la empresa correcta.
 */
export async function getResourceCompanyId(
  client: ResourceClient,
  kind: MaintenanceResourceKind | undefined,
  resourceId: string
): Promise<string> {
  if (kind === 'other_equipment') {
    const equipment = await client.other_equipment.findUnique({
      where: { id: resourceId },
      select: { company_id: true },
    });
    if (!equipment) throw new Error('No se encontró el equipamiento para resolver su empresa');
    return equipment.company_id;
  }

  const vehicle = await client.vehicles.findUnique({
    where: { id: resourceId },
    select: { company_id: true },
  });
  if (!vehicle?.company_id) throw new Error('No se encontró la empresa del vehículo');
  return vehicle.company_id;
}

/**
 * Empresa de un pedido de mantenimiento: los ítems que se le agregan heredan la misma.
 */
export async function getMaintenanceOrderCompanyId(client: OrderClient, orderId: string): Promise<string> {
  const order = await client.maintenance_orders.findUnique({
    where: { id: orderId },
    select: { company_id: true },
  });
  if (!order) throw new Error('No se encontró el pedido de mantenimiento para resolver su empresa');
  return order.company_id;
}
