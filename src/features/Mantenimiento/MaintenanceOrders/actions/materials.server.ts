'use server';

import { checkPermissionServer } from '@/features/Permissions';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { withMaintenanceActor } from '@/features/Mantenimiento/shared/maintenance-actor';
import { lockMaintenanceOrder } from '@/features/Mantenimiento/shared/order-lock';
import { toActionError } from '@/features/Warehouses/lib/action-errors';
import { createMaterialRequest } from '@/features/Warehouses/lib/create-request';
import { StockError } from '@/features/Warehouses/lib/stock-errors';
import {
  maintenanceMaterialRequestSchema,
  type MaintenanceMaterialRequestFormValues,
} from '@/features/Warehouses/schemas/requests';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { getDeliveredMaterials } from '../lib/order-materials';

const logger = new Logger('MaintenanceOrders/materials');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Estados de OT que ya no admiten pedidos. */
const CLOSED_WORK_ORDER_STATUSES = ['completed', 'completed_partial', 'cancelled'] as const;

/** OTs abiertas de la orden, para elegir a cual imputar el pedido. */
async function getOpenWorkOrders(companyId: string, orderId: string) {
  const rows = await prisma.work_orders.findMany({
    where: {
      company_id: companyId,
      status: { notIn: [...CLOSED_WORK_ORDER_STATUSES] },
      maintenance_order_items: { some: { maintenance_order_id: orderId } },
    },
    select: { id: true, order_number: true, workshop_sectors: { select: { name: true } }, workshops: { select: { name: true } } },
    orderBy: { sequence_number: 'asc' },
  });
  return rows.map((wo) => ({
    id: wo.id,
    label: `${wo.order_number} · ${wo.workshop_sectors?.name ?? wo.workshops.name}`,
  }));
}

/**
 * Materiales de la orden (Almacenes etapa 4): sus pedidos, lo entregado neto por OT y si el
 * usuario puede pedir desde aca. Costos solo con `almacenes:movimientos:view_prices`.
 */
export async function getMaintenanceOrderMaterials(orderId: string) {
  if (!UUID_RE.test(orderId)) return null;
  const companyId = await getActiveCompanyId();
  const order = await prisma.maintenance_orders.findFirst({
    where: { id: orderId, company_id: companyId },
    select: { id: true, status: true },
  });
  if (!order) return null;

  const [canViewPrices, canCreate, requests, delivered] = await Promise.all([
    checkPermissionServer('almacenes', 'movimientos', 'view_prices'),
    checkPermissionServer('almacenes', 'pedidos', 'create'),
    prisma.material_requests.findMany({
      where: { company_id: companyId, maintenance_order_id: orderId },
      select: {
        id: true,
        number: true,
        status: true,
        created_at: true,
        work_order: { select: { order_number: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { number: 'asc' },
    }),
    getDeliveredMaterials(prisma, companyId, orderId),
  ]);

  // Agrupado por OT; lo pedido "a nivel orden" va bajo `null`.
  const groups = new Map<string, { workOrder: string | null; lines: typeof delivered }>();
  for (const row of delivered) {
    const key = row.workOrderId ?? 'order';
    const label = row.workOrderNumber ? `${row.workOrderNumber}${row.sectorName ? ` · ${row.sectorName}` : ''}` : null;
    const group = groups.get(key) ?? { workOrder: label, lines: [] };
    group.lines.push(row);
    groups.set(key, group);
  }
  const total = delivered.reduce((acc, r) => acc + Number(r.totalCost), 0);
  const canRequest = canCreate && order.status === 'in_workshop';

  return {
    requests: requests.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      workOrder: r.work_order?.order_number ?? null,
      lineCount: r._count.lines,
    })),
    delivered: [...groups.values()].map((g) => ({
      workOrder: g.workOrder,
      totalCost: canViewPrices ? g.lines.reduce((acc, l) => acc + Number(l.totalCost), 0).toFixed(2) : null,
      lines: g.lines.map((l) => ({
        materialId: l.materialId,
        material: `${l.code} · ${l.name}`,
        unit: l.unit,
        quantity: l.quantity.toString(),
        totalCost: canViewPrices ? l.totalCost.toFixed(2) : null,
      })),
    })),
    totalCost: canViewPrices && delivered.length > 0 ? total.toFixed(2) : null,
    canRequest,
    workOrderOptions: canRequest ? await getOpenWorkOrders(companyId, orderId) : [],
  };
}

export type MaintenanceOrderMaterials = NonNullable<Awaited<ReturnType<typeof getMaintenanceOrderMaterials>>>;

/** Pedido de materiales desde el detalle de la orden: `pedidos:create` y la orden en taller. */
export async function createOrderMaterialRequestAction(
  orderId: string,
  values: MaintenanceMaterialRequestFormValues
): Promise<ActionResult<{ number: string }>> {
  if (!(await checkPermissionServer('almacenes', 'pedidos', 'create'))) {
    return fail('No tenés permiso para hacer pedidos de materiales');
  }
  const parsed = maintenanceMaterialRequestSchema.safeParse(values);
  if (!parsed.success || !UUID_RE.test(orderId)) return fail(parsed.error?.issues[0]?.message ?? 'Datos inválidos');

  const profile = await getServerAuthProfile();
  if (!profile) return fail('Tu sesión expiró. Volvé a ingresar.');
  const companyId = await getActiveCompanyId();

  try {
    const created = await withMaintenanceActor(profile.id, async (tx) => {
      // El estado se lee con la orden lockeada: no puede completarse entre el chequeo y el alta.
      await lockMaintenanceOrder(tx, orderId);
      const order = await tx.maintenance_orders.findFirst({
        where: { id: orderId, company_id: companyId },
        select: { status: true, order_number: true },
      });
      if (!order) throw new StockError('NOT_FOUND', 'La orden no existe');
      if (order.status !== 'in_workshop') {
        throw new StockError(
          'INVALID_STATE',
          `La orden ${order.order_number ?? ''} no está en taller: solo se piden materiales mientras se trabaja`.replace(/\s+/g, ' ')
        );
      }
      return createMaterialRequest(tx, companyId, profile.id, {
        destination: {
          destinationType: 'MAINTENANCE_ORDER',
          employeeId: null,
          vehicleId: null,
          otherEquipmentId: null,
          maintenanceOrderId: orderId,
          customerId: null,
          customerServiceId: null,
        },
        workOrderId: parsed.data.workOrderId || null,
        notes: parsed.data.notes || null,
        lines: parsed.data.lines,
      });
    });
    logger.info('Pedido de materiales desde la orden', { data: { number: created.number, orderId } });
    revalidatePath('/dashboard/maintenance');
    return ok({ number: created.number });
  } catch (error) {
    return toActionError(error, logger, 'enviar el pedido');
  }
}
