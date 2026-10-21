'use server';

import { Prisma } from '@/generated/prisma/client';
import type { work_order_status } from '@/generated/prisma/enums';
import { getWorkOrderBlockingStatus } from '@/features/OperatorPanel/actions/blocking';
import { assertAssignedSector } from '@/features/OperatorPanel/actions/perimeter';
import { prisma } from '@/shared/lib/prisma';

/**
 * Lecturas del panel del operario.
 *
 * Todas reciben el `sectorId` del cliente y lo validan contra los sectores asignados al
 * operario de la sesión (`assertAssignedSector`): sin RLS, el id solo no alcanza. El
 * `company_id` del `where` sale de la sesión, nunca del caller.
 */

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const OPEN_STATUSES: work_order_status[] = ['pending', 'in_progress', 'paused'];
const CLOSED_STATUSES: work_order_status[] = ['completed', 'completed_partial'];

/** Datos de identificación del recurso (vehículo o equipamiento) en los listados. */
const LIST_RESOURCE_SELECT = {
  vehicles: {
    select: { id: true, domain: true, serie: true, intern_number: true, sub_type: { select: { id: true, name: true } } },
  },
  other_equipment: {
    select: {
      id: true,
      serial_number: true,
      intern_number: true,
      sub_type: { select: { id: true, name: true } },
    },
  },
} as const;

/** Lo que la tarjeta de OT necesita para el progreso y el número de pedido. */
const LIST_ITEMS_SELECT = {
  select: {
    id: true,
    status: true,
    work_order_item_repairs: { select: { id: true, status: true, is_diagnostico: true } },
    maintenance_order_items: {
      select: { maintenance_orders: { select: { id: true, order_number: true } } },
    },
  },
} as const;

const WORK_ORDER_LIST_SELECT = {
  id: true,
  order_number: true,
  status: true,
  priority: true,
  planned_start_date: true,
  started_at: true,
  completed_at: true,
  created_at: true,
  ...LIST_RESOURCE_SELECT,
  work_order_items: LIST_ITEMS_SELECT,
} as const;

/** OTs abiertas del sector (y las cerradas si se piden), con el bloqueo por secuencia resuelto. */
export async function getWorkOrdersForOperator(sectorId: string, includeCompleted?: boolean) {
  const operator = await assertAssignedSector(sectorId);

  const workOrders = await prisma.work_orders.findMany({
    where: {
      sector_id: sectorId,
      company_id: operator.companyId,
      status: { in: includeCompleted ? [...OPEN_STATUSES, ...CLOSED_STATUSES] : OPEN_STATUSES },
    },
    select: WORK_ORDER_LIST_SELECT,
    orderBy: [{ priority: 'asc' }, { planned_start_date: 'asc' }],
    take: 50,
  });

  const blocking = await getWorkOrderBlockingStatus(
    prisma,
    workOrders.map((workOrder) => workOrder.id)
  );

  return workOrders.map((workOrder) => ({
    ...workOrder,
    is_blocked: blocking[workOrder.id]?.isBlocked ?? false,
    blocked_by_sector: blocking[workOrder.id]?.blockedBySector ?? null,
  }));
}

export type OperatorWorkOrder = Awaited<ReturnType<typeof getWorkOrdersForOperator>>[number];

/**
 * OTs cerradas del sector, paginadas y de la más reciente a la más vieja.
 *
 * La página y el total salen de la misma transacción y con `RepeatableRead`: las dos ven el
 * mismo snapshot, así un cierre en el medio no deja el `totalPages` desfasado de lo que se
 * está mostrando. Con el `READ COMMITTED` por defecto no alcanzaría con la transacción —
 * cada statement toma su propio snapshot y el commit del medio sigue siendo visible.
 */
export async function getCompletedWorkOrdersForOperator(sectorId: string, page: number = 0, pageSize: number = 10) {
  const operator = await assertAssignedSector(sectorId);

  // `page` y `pageSize` llegan del cliente: un `page` negativo hace que Prisma lance y un
  // `pageSize` enorme se trae el histórico entero del sector de una.
  const safePage = Math.max(0, Math.trunc(page) || 0);
  const safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(pageSize) || DEFAULT_PAGE_SIZE));

  const where = {
    sector_id: sectorId,
    company_id: operator.companyId,
    status: { in: CLOSED_STATUSES },
  };

  const [rows, totalCount] = await prisma.$transaction(
    [
      prisma.work_orders.findMany({
        where,
        select: WORK_ORDER_LIST_SELECT,
        orderBy: { completed_at: 'desc' },
        skip: safePage * safePageSize,
        take: safePageSize,
      }),
      prisma.work_orders.count({ where }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );

  return {
    data: rows.map((workOrder) => ({
      ...workOrder,
      // Una OT cerrada ya no se bloquea: el candado sólo aplica al trabajo pendiente.
      is_blocked: false,
      blocked_by_sector: null as string | null,
    })),
    totalCount,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.ceil(totalCount / safePageSize),
  };
}

/**
 * Detalle de una OT del sector, con sus ítems, tareas y el origen de cada ítem.
 *
 * Devuelve `null` si la OT no existe o no cae en el perímetro del operario: la página
 * redirige al listado, que es lo mismo que pasaba antes cuando la consulta no traía nada.
 */
export async function getWorkOrderDetailForOperator(workOrderId: string, sectorId: string) {
  const operator = await assertAssignedSector(sectorId);

  const workOrder = await prisma.work_orders.findFirst({
    where: { id: workOrderId, sector_id: sectorId, company_id: operator.companyId },
    select: {
      id: true,
      order_number: true,
      status: true,
      priority: true,
      planned_start_date: true,
      started_at: true,
      completed_at: true,
      notes: true,
      sector_id: true,
      vehicles: {
        select: {
          id: true,
          domain: true,
          serie: true,
          intern_number: true,
          kilometer: true,
          engine_hours: true,
          sub_type: { select: { id: true, name: true } },
        },
      },
      other_equipment: {
        select: {
          id: true,
          serial_number: true,
          intern_number: true,
          horometer: true,
          sub_type: { select: { id: true, name: true } },
        },
      },
      work_order_items: {
        select: {
          id: true,
          status: true,
          maintenance_order_item_id: true,
          maintenance_order_items: {
            select: {
              id: true,
              description: true,
              images: true,
              maintenance_order_id: true,
              maintenance_orders: { select: { id: true, order_number: true } },
              types_of_repairs: { select: { id: true, name: true } },
              maintenance_order_item_repair_types: {
                select: { types_of_repairs: { select: { id: true, name: true } } },
              },
              // El grupo de reparaciones viaja en la misma consulta: ya no hace falta la
              // segunda consulta que hacía falta cuando los tipos generados de Supabase no
              // conocían `maintenance_group_id`.
              maintenance_request_groups: { select: { name: true } },
              maintenance_request_items: {
                select: {
                  id: true,
                  description: true,
                  free_text: true,
                  images: true,
                  checklist_deviations: { select: { id: true, item_label: true, section_code: true } },
                  maintenance_request_groups: { select: { name: true } },
                },
              },
            },
          },
          work_order_item_repairs: {
            select: {
              id: true,
              status: true,
              technician_notes: true,
              return_reason: true,
              rejection_reason: true,
              is_operator_added: true,
              is_diagnostico: true,
              repair_type_id: true,
              types_of_repairs: { select: { id: true, name: true, criticity: true, autorizable: true } },
            },
          },
        },
      },
    },
  });

  if (!workOrder) return null;

  const maintenanceOrderId =
    workOrder.work_order_items[0]?.maintenance_order_items?.maintenance_order_id ?? null;

  // "Uno a la vez": si otra OT del mismo pedido está en progreso, el panel lo avisa.
  const activeSibling = maintenanceOrderId
    ? await prisma.work_orders.findFirst({
        where: {
          id: { not: workOrderId },
          status: 'in_progress',
          maintenance_order_items: { some: { maintenance_order_id: maintenanceOrderId } },
        },
        select: { workshop_sectors: { select: { name: true } } },
      })
    : null;

  const workOrderItems = workOrder.work_order_items.map((item) => {
    const moItem = item.maintenance_order_items;
    // El ítem del pedido hereda el grupo del ítem de la solicitud que lo originó.
    const groupName =
      moItem?.maintenance_request_groups?.name ?? moItem?.maintenance_request_items?.maintenance_request_groups?.name;

    return { ...item, group_name: groupName?.trim() || null };
  });

  return {
    ...workOrder,
    other_equipment: workOrder.other_equipment
      ? // `horometer` es un Decimal de Prisma: como instancia de clase no sobrevive el
        // límite server → client de los Server Actions, así que viaja como texto.
        { ...workOrder.other_equipment, horometer: workOrder.other_equipment.horometer?.toString() ?? null }
      : null,
    work_order_items: workOrderItems,
    has_active_sibling_wo: activeSibling !== null,
    active_sibling_sector: activeSibling?.workshop_sectors?.name ?? null,
  };
}

export type OperatorWorkOrderDetail = NonNullable<Awaited<ReturnType<typeof getWorkOrderDetailForOperator>>>;
