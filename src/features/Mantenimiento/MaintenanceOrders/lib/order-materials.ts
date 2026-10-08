import { Prisma } from '@/generated/prisma/client';

/**
 * Sin `server-only` a proposito: lo importa `pdf/report-data.ts`, que tambien corre fuera de
 * Next para verificar el PDF. No es una server action (no expone nada al cliente).
 *
 * Materiales de una orden de mantenimiento (Almacenes etapa 4). Los usan el detalle de la orden,
 * el PDF y el cierre. Lo entregado se calcula de las lineas de stock vinculadas a los pedidos de
 * la orden: Σ(−direction × cantidad), asi una anulacion de entrega descuenta.
 */

type Client = Pick<Prisma.TransactionClient, '$queryRaw' | 'material_requests'>;

/** Estados de pedido que todavia esperan una entrega o una decision. */
export const OPEN_REQUEST_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_DELIVERED'] as const;

export interface DeliveredMaterialRow {
  workOrderId: string | null;
  workOrderNumber: string | null;
  sectorName: string | null;
  materialId: string;
  code: string;
  name: string;
  unit: string;
  quantity: Prisma.Decimal;
  totalCost: Prisma.Decimal;
}

/** Lo entregado neto, por OT y material. Las filas en cero (entregado y anulado) no aparecen. */
export async function getDeliveredMaterials(
  client: Pick<Prisma.TransactionClient, '$queryRaw'>,
  companyId: string,
  orderId: string
): Promise<DeliveredMaterialRow[]> {
  const rows = await client.$queryRaw<
    {
      work_order_id: string | null;
      work_order_number: string | null;
      sector_name: string | null;
      material_id: string;
      code: string;
      name: string;
      unit: string;
      quantity: Prisma.Decimal;
      total_cost: Prisma.Decimal;
    }[]
  >`
    SELECT mr.work_order_id, wo.order_number AS work_order_number, ws.name AS sector_name,
           m.id AS material_id, m.code, m.name, u.abbreviation AS unit,
           SUM(-sml.direction * sml.quantity) AS quantity,
           SUM(-sml.direction * sml.total_cost) AS total_cost
    FROM stock_movement_lines sml
    JOIN material_request_lines mrl ON mrl.id = sml.request_line_id
    JOIN material_requests mr ON mr.id = mrl.request_id
    JOIN materials m ON m.id = sml.material_id
    JOIN measurement_units u ON u.id = m.unit_id
    LEFT JOIN work_orders wo ON wo.id = mr.work_order_id
    LEFT JOIN workshop_sectors ws ON ws.id = wo.sector_id
    WHERE mr.maintenance_order_id = ${orderId}::uuid AND mr.company_id = ${companyId}::uuid
    GROUP BY mr.work_order_id, wo.order_number, ws.name, m.id, m.code, m.name, u.abbreviation
    HAVING SUM(-sml.direction * sml.quantity) <> 0
    ORDER BY wo.order_number NULLS FIRST, m.name
  `;
  return rows.map((r) => ({
    workOrderId: r.work_order_id,
    workOrderNumber: r.work_order_number,
    sectorName: r.sector_name,
    materialId: r.material_id,
    code: r.code,
    name: r.name,
    unit: r.unit,
    quantity: new Prisma.Decimal(r.quantity),
    totalCost: new Prisma.Decimal(r.total_cost),
  }));
}

/** Pedidos de la orden que impiden completarla, ordenados por numero. */
export async function findOpenMaterialRequests(client: Client, companyId: string, orderId: string): Promise<string[]> {
  const rows = await client.material_requests.findMany({
    where: { company_id: companyId, maintenance_order_id: orderId, status: { in: [...OPEN_REQUEST_STATUSES] } },
    select: { number: true },
    orderBy: { number: 'asc' },
  });
  return rows.map((r) => r.number);
}

/** "PED-000012 sigue abierto…" / "PED-000012 y 2 pedidos más siguen abiertos…". */
export function openRequestsMessage(numbers: string[], action: 'completar' | 'rechazar' = 'completar'): string {
  const [first, ...rest] = numbers;
  const subject = rest.length === 0 ? `${first} sigue abierto` : `${first} y ${rest.length === 1 ? '1 pedido más siguen abiertos' : `${rest.length} pedidos más siguen abiertos`}`;
  const object = rest.length === 0 ? 'entregalo, cerralo o cancelalo' : 'entregalos, cerralos o cancelalos';
  return `${subject}: ${object} antes de ${action} la orden`;
}
