import type { Prisma } from '@/generated/prisma/client';

/**
 * Solicitud de mantenimiento "abierta": `pending_approval`, o `approved` que todavía no tiene
 * ningún pedido (`maintenance_orders`). Una aprobada con pedido ya se cuenta en el pedido, así
 * que no se suma dos veces. Las `rejected` / `completed` / `cancelled` están cerradas.
 *
 * Módulo sin directiva: lo comparten la ficha del equipo y el Dashboard para contar lo mismo.
 */
export const PENDING_APPROVAL_REQUEST_WHERE = {
  status: 'pending_approval',
} satisfies Prisma.maintenance_requestsWhereInput;

export const APPROVED_WITHOUT_ORDER_REQUEST_WHERE = {
  status: 'approved',
  maintenance_orders: { none: {} },
} satisfies Prisma.maintenance_requestsWhereInput;

export const OPEN_MAINTENANCE_REQUEST_WHERE = {
  OR: [PENDING_APPROVAL_REQUEST_WHERE, APPROVED_WITHOUT_ORDER_REQUEST_WHERE],
} satisfies Prisma.maintenance_requestsWhereInput;
