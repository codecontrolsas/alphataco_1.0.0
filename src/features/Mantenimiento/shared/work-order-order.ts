import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

/**
 * Pedido de mantenimiento al que pertenece la OT, o `null` si la OT no cuelga de ninguno.
 *
 * La OT no tiene FK directa a la orden: la relacion pasa por `maintenance_order_items.work_order_id`.
 * La usan el panel del operario y Almacenes (pedidos de materiales desde una OT, etapa 4).
 */
export async function findMaintenanceOrderIdByWorkOrder(
  tx: Pick<Prisma.TransactionClient, 'maintenance_order_items'>,
  workOrderId: string
): Promise<string | null> {
  const orderItem = await tx.maintenance_order_items.findFirst({
    where: { work_order_id: workOrderId },
    select: { maintenance_order_id: true },
  });

  return orderItem?.maintenance_order_id ?? null;
}
