import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import { statusAfterDeliveries, type MaterialRequestStatus } from './request-state-machine';
import { StockError } from './stock-errors';

/**
 * Lecturas y estado de los pedidos de materiales que comparten el motor (entregas y anulaciones)
 * y las actions (aprobar, rechazar, cerrar). No importa el motor: el motor la importa a ella.
 */

type Tx = Prisma.TransactionClient;

export interface LockedRequest {
  id: string;
  number: string;
  status: MaterialRequestStatus;
  requested_by: string;
}

/**
 * Lockea el pedido (`FOR UPDATE`). En el orden de locks del dominio va despues del movimiento
 * original (anulaciones) y antes de los materiales: dos entregas del mismo pedido se ordenan
 * aca, y la segunda ve lo que entrego la primera.
 */
export async function lockRequest(tx: Tx, companyId: string, requestId: string): Promise<LockedRequest> {
  const rows = await tx.$queryRaw<LockedRequest[]>`
    SELECT id, number, status::text AS status, requested_by
    FROM material_requests
    WHERE id = ${requestId}::uuid AND company_id = ${companyId}::uuid
    FOR UPDATE
  `;
  const request = rows[0];
  if (!request) throw new StockError('NOT_FOUND', 'El pedido no existe');
  return request;
}

/**
 * Lo entregado por linea del pedido: Σ(−direction × quantity) de las lineas de stock vinculadas.
 * Una salida resta (direction −1, suma entregado); su anulacion lo devuelve.
 */
export async function deliveredByLine(tx: Pick<Tx, '$queryRaw'>, requestId: string): Promise<Map<string, Prisma.Decimal>> {
  const rows = await tx.$queryRaw<{ request_line_id: string; delivered: Prisma.Decimal }[]>`
    SELECT sml.request_line_id, SUM(-sml.direction * sml.quantity) AS delivered
    FROM stock_movement_lines sml
    JOIN material_request_lines mrl ON mrl.id = sml.request_line_id
    WHERE mrl.request_id = ${requestId}::uuid
    GROUP BY sml.request_line_id
  `;
  return new Map(rows.map((r) => [r.request_line_id, new Prisma.Decimal(r.delivered)]));
}

/**
 * Lo entregado de varias lineas de pedido (de uno o varios pedidos) en UNA consulta. Misma regla
 * que `deliveredByLine`; para listas (OT, orden de mantenimiento) sin N+1.
 */
export async function deliveredByLines(
  tx: Pick<Tx, '$queryRaw'>,
  lineIds: string[]
): Promise<Map<string, Prisma.Decimal>> {
  if (lineIds.length === 0) return new Map();
  const rows = await tx.$queryRaw<{ request_line_id: string; delivered: Prisma.Decimal }[]>`
    SELECT request_line_id, SUM(-direction * quantity) AS delivered
    FROM stock_movement_lines
    WHERE request_line_id = ANY(${lineIds}::uuid[])
    GROUP BY request_line_id
  `;
  return new Map(rows.map((r) => [r.request_line_id, new Prisma.Decimal(r.delivered)]));
}

/** Recalcula y guarda el estado despues de una entrega o de su anulacion (con el pedido lockeado). */
export async function recomputeRequestStatus(tx: Tx, request: LockedRequest): Promise<MaterialRequestStatus> {
  const [lines, delivered] = await Promise.all([
    tx.material_request_lines.findMany({ where: { request_id: request.id }, select: { id: true, quantity: true } }),
    deliveredByLine(tx, request.id),
  ]);
  const next = statusAfterDeliveries(
    request.status,
    lines.map((l) => ({
      requested: Number(l.quantity),
      delivered: Number(delivered.get(l.id) ?? 0),
    }))
  );
  if (next !== request.status) {
    await tx.material_requests.update({ where: { id: request.id }, data: { status: next } });
  }
  return next;
}
