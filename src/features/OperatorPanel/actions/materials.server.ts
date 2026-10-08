'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { withMaintenanceActor } from '@/features/Mantenimiento/shared/maintenance-actor';
import { findMaintenanceOrderIdByWorkOrder } from '@/features/Mantenimiento/shared/work-order-order';
import { assertWorkOrderInScope, requireOperatorIdentity } from '@/features/OperatorPanel/actions/perimeter';
import { toActionError } from '@/features/Warehouses/lib/action-errors';
import { createMaterialRequest } from '@/features/Warehouses/lib/create-request';
import { deliveredByLines } from '@/features/Warehouses/lib/requests';
import { StockError } from '@/features/Warehouses/lib/stock-errors';
import {
  maintenanceMaterialRequestSchema,
  type MaintenanceMaterialRequestFormValues,
} from '@/features/Warehouses/schemas/requests';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';

const logger = new Logger('OperatorPanel/materials');

/**
 * Pedidos de materiales desde la OT (Almacenes etapa 4). El operario no tiene permisos de
 * Almacenes: se autoriza por PERIMETRO (la OT tiene que ser de un sector asignado), igual que el
 * resto del panel. El destino (la orden de la OT y la OT) lo fija el servidor.
 */

const OPTIONS_LIMIT = 30;
const contains = (query: string) => ({ contains: query.trim(), mode: 'insensitive' as const });

/** Catalogo ACTIVO de la empresa del operario: sin stock ni costos (no los necesita para pedir). */
export async function searchOperatorMaterialOptions(query: string) {
  const operator = await requireOperatorIdentity();
  const where = {
    company_id: operator.companyId,
    is_active: true,
    ...(query.trim() ? { OR: [{ code: contains(query) }, { name: contains(query) }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.materials.findMany({
      where,
      select: { id: true, code: true, name: true, tracking_type: true, unit: { select: { abbreviation: true } } },
      orderBy: { name: 'asc' },
      take: OPTIONS_LIMIT,
    }),
    prisma.materials.count({ where }),
  ]);
  return {
    items: items.map(({ unit, ...m }) => ({ ...m, unit: unit.abbreviation, label: `${m.code} · ${m.name}` })),
    total,
  };
}

/** Pedido de materiales imputado a la orden de la OT y a la OT. */
export async function createOperatorMaterialRequest(
  values: MaintenanceMaterialRequestFormValues
): Promise<ActionResult<{ number: string }>> {
  const parsed = maintenanceMaterialRequestSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');

  let operator: Awaited<ReturnType<typeof assertWorkOrderInScope>>['operator'];
  try {
    ({ operator } = await assertWorkOrderInScope(parsed.data.workOrderId));
  } catch (error) {
    // Fuera del perimetro: el mensaje es generico y no revela si la OT existe.
    logger.warn('Pedido fuera del perimetro del operario', { data: { error } });
    return fail('La orden de trabajo no pertenece a tus sectores');
  }

  try {
    const created = await withMaintenanceActor(operator.profileId, async (tx) => {
      const maintenanceOrderId = await findMaintenanceOrderIdByWorkOrder(tx, parsed.data.workOrderId);
      if (!maintenanceOrderId) {
        throw new StockError('INVALID_DESTINATION', 'La OT no pertenece a ninguna orden de mantenimiento');
      }
      return createMaterialRequest(tx, operator.companyId, operator.profileId, {
        destination: {
          destinationType: 'MAINTENANCE_ORDER',
          employeeId: null,
          vehicleId: null,
          otherEquipmentId: null,
          maintenanceOrderId,
          customerId: null,
          customerServiceId: null,
        },
        workOrderId: parsed.data.workOrderId,
        notes: parsed.data.notes || null,
        lines: parsed.data.lines,
      });
    });
    logger.info('Pedido de materiales desde la OT', { data: { number: created.number, workOrderId: parsed.data.workOrderId } });
    return ok({ number: created.number });
  } catch (error) {
    return toActionError(error, logger, 'enviar el pedido');
  }
}

/** Pedidos de la OT con lo pedido y lo entregado por linea. Sin costos. */
export async function getWorkOrderMaterialRequests(workOrderId: string) {
  await assertWorkOrderInScope(workOrderId);
  const requests = await prisma.material_requests.findMany({
    where: { work_order_id: workOrderId },
    select: {
      id: true,
      number: true,
      status: true,
      created_at: true,
      lines: {
        select: { id: true, quantity: true, material: { select: { code: true, name: true, unit: { select: { abbreviation: true } } } } },
        orderBy: { material: { name: 'asc' } },
      },
    },
    orderBy: { number: 'desc' },
  });

  const delivered = await deliveredByLines(
    prisma,
    requests.flatMap((r) => r.lines.map((l) => l.id))
  );
  return requests.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    lines: r.lines.map((l) => ({
      id: l.id,
      material: `${l.material.code} · ${l.material.name}`,
      unit: l.material.unit.abbreviation,
      requested: l.quantity.toString(),
      delivered: (delivered.get(l.id) ?? 0).toString(),
    })),
  }));
}

export type WorkOrderMaterialRequest = Awaited<ReturnType<typeof getWorkOrderMaterialRequests>>[number];
