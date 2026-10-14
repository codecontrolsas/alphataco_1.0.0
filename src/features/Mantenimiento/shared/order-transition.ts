import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import {
  isMaintenanceOrderStatus,
  isValidMaintenanceOrderTransition,
  nextMaintenanceOrderStatuses,
  type MaintenanceOrderStatus,
} from '@/features/Mantenimiento/lib/order-status';
import { findOpenMaterialRequests, openRequestsMessage } from '@/features/Mantenimiento/MaintenanceOrders/lib/order-materials';
import { prisma } from '@/shared/lib/prisma';
import { lockMaintenanceOrder } from './order-lock';

type PrismaLike = Prisma.TransactionClient | typeof prisma;

/**
 * Rechazo de NEGOCIO de la guarda: el pedido esta en un estado que no habilita la
 * transicion pedida. Tiene clase propia para que un caller pueda decidir seguir sin la
 * transicion (ver `getOrderTransitionBlock` en OperatorPanel) SIN tragarse tambien un
 * error de SQL o de conexion, que si tiene que abortar la operacion.
 */
export class OrderTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderTransitionError';
  }
}

/**
 * Guarda de transición de `maintenance_orders.status`.
 *
 * Es el punto por el que pasan TODAS las actions que cambian el estado del pedido: lee el
 * estado actual y lo contrasta contra la máquina de `lib/order-status.ts` antes de escribir.
 * Sin esto, cualquier endpoint podía saltar pasos del circuito (por ejemplo cerrar una orden
 * que nunca entró al taller) porque el estado se escribía a mano.
 *
 * Completar o rechazar exige, ademas, que la orden no tenga pedidos de materiales abiertos.
 *
 * Reescribir el MISMO estado se deja pasar: es el doble click / reintento de siempre, y
 * antes tampoco fallaba. Devuelve el estado previo para el log de actividad.
 */
export async function assertOrderTransition(
  client: PrismaLike,
  orderId: string,
  nextStatus: MaintenanceOrderStatus
): Promise<string | null> {
  const order = await client.maintenance_orders.findUnique({
    where: { id: orderId },
    select: { status: true, company_id: true },
  });

  if (!order) throw new OrderTransitionError('Pedido de mantenimiento no encontrado');

  const current = order.status;
  if (current === nextStatus) return current;

  if (!isMaintenanceOrderStatus(current)) {
    throw new OrderTransitionError(`El pedido está en un estado desconocido ("${current}")`);
  }

  if (!isValidMaintenanceOrderTransition(current, nextStatus)) {
    const allowed = nextMaintenanceOrderStatuses(current);
    throw new OrderTransitionError(
      `No se puede pasar el pedido de "${current}" a "${nextStatus}"` +
        (allowed.length > 0 ? ` (estados posibles: ${allowed.join(', ')})` : ' (es un estado final)')
    );
  }

  // Almacenes etapa 4: una orden no se completa con pedidos de materiales abiertos. Va aca y no
  // en cada action porque TODOS los caminos que la completan pasan por esta guarda (el cierre
  // del taller y el de Operaciones, legacy). Los callers ya lockearon la orden, y el alta de un
  // pedido a una orden (`createMaterialRequest`) tambien la lockea antes de validarla: un pedido
  // no puede aparecer entre este chequeo y el cierre.
  //
  // Rechazar la orden tambien se bloquea (decision del usuario): un pedido abierto de una orden
  // rechazada ya no se podria entregar y quedaria colgado.
  if (nextStatus === 'completed' || nextStatus === 'rejected') {
    const open = await findOpenMaterialRequests(client, order.company_id, orderId);
    if (open.length > 0) {
      throw new OrderTransitionError(openRequestsMessage(open, nextStatus === 'completed' ? 'completar' : 'rechazar'));
    }
  }

  return current;
}

type OrderUpdateData = Omit<Prisma.maintenance_ordersUncheckedUpdateManyInput, 'status'>;

/**
 * Transición ATÓMICA de estado de un pedido: lockea la fila, valida la transición con la
 * máquina de estados y escribe con el estado leído en el `where`, verificando `count`.
 *
 * `assertOrderTransition` sola lee y después el `update` no llevaba `status` en el `where`: dos
 * transacciones sin lock podían pisarse. Acá el lock (idempotente si el caller ya lo tomó, mismo
 * orden pedido → OT) y el `where` con el estado esperado cierran la carrera.
 *
 * Devuelve el estado previo (para el log de actividad). Lanza `OrderTransitionError` si el
 * pedido cambió de estado mientras tanto.
 */
export async function transitionMaintenanceOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  nextStatus: MaintenanceOrderStatus,
  data: OrderUpdateData = {}
): Promise<string | null> {
  await lockMaintenanceOrder(tx, orderId);
  const previous = await assertOrderTransition(tx, orderId, nextStatus);

  const result = await tx.maintenance_orders.updateMany({
    where: { id: orderId, ...(previous ? { status: previous } : {}) },
    data: { ...data, status: nextStatus },
  });

  if (result.count !== 1) {
    throw new OrderTransitionError('El pedido cambió de estado mientras se procesaba. Recargá e intentá de nuevo.');
  }

  return previous;
}
