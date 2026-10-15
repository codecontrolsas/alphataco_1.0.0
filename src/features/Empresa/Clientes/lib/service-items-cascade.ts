import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

type Tx = Pick<Prisma.TransactionClient, 'service_items'>;

/**
 * Propaga el estado activo de un contrato (`customer_services.is_active`) a TODOS sus ítems
 * (`service_items`). Reemplaza al trigger `after_service_update` de `customer_services`:
 * desactivar el contrato desactiva todos los ítems y reactivarlo los reactiva todos, incluidos los
 * que alguien había apagado a mano (se hereda el comportamiento anterior).
 *
 * Debe llamarse en la MISMA transacción que cambia `is_active` del contrato, solo cuando cambió.
 */
export async function cascadeServiceItemsActive(
  tx: Tx,
  serviceId: string,
  companyId: string,
  isActive: boolean
): Promise<number> {
  const result = await tx.service_items.updateMany({
    where: { customer_service_id: serviceId, company_id: companyId },
    data: { is_active: isActive },
  });
  return result.count;
}
