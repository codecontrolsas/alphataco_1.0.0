'use server';

import { ACTIVITY_LOG } from '@/features/Mantenimiento/shared/activity-log/action-types';
import { logActivity } from '@/features/Mantenimiento/shared/activity-log/log-activity';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { CACHE_TAGS } from '@/shared/constants/cache';
import { INVALIDATION_MAP } from '@/shared/constants/cache-invalidation-map';
import { prisma } from '@/shared/lib/prisma';
import { toDateOnly } from '@/shared/lib/date-only';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';
import { cacheTag } from 'next/cache';
import { generateMaintenanceOrderNumber } from '../../OrderManagement/actions/items.server';
import type {
  ApproveWorkshopEntryInput,
  MaintenanceOrderFilters,
  RejectPendingOrderInput,
  ScheduleOrderInput,
} from '../../types';
import { getSupervisorFilterInfo } from '../../utils/supervisorFilter';
import { withMaintenanceActor } from '@/features/Mantenimiento/shared/maintenance-actor';
import { lockMaintenanceOrder } from '@/features/Mantenimiento/shared/order-lock';
import { assertOrderTransition } from '@/features/Mantenimiento/shared/order-transition';

const serverLogger = new Logger('PedidosMantenimiento/actions');

// ─── Include reutilizable para maintenance_order_items ─────────────────────

const MAINTENANCE_ORDER_ITEMS_INCLUDE = {
  maintenance_order_item_repair_types: {
    include: {
      types_of_repairs: {
        select: { id: true, name: true },
      },
    },
  },
  types_of_repairs: {
    select: { id: true, name: true },
  },
  // Grupo de reparaciones del que salio el item, para marcarlo en los listados
  maintenance_request_groups: {
    select: { id: true, name: true },
  },
  maintenance_request_items: {
    include: {
      maintenance_request_groups: {
        select: { id: true, name: true },
      },
      checklist_deviations: {
        select: {
          id: true,
          item_code: true,
          item_label: true,
          section_code: true,
          driver_comment: true,
          checklist_answers: {
            select: {
              id: true,
              employees: {
                select: { id: true, firstname: true, lastname: true },
              },
              profile: {
                select: { id: true, fullname: true, email: true },
              },
            },
          },
        },
      },
    },
  },
} as const;

// Include con answer_data adicional (solo para getMaintenanceOrdersConfirmed)
const MAINTENANCE_ORDER_ITEMS_INCLUDE_WITH_ANSWER_DATA = {
  maintenance_order_item_repair_types: {
    include: {
      types_of_repairs: {
        select: { id: true, name: true },
      },
    },
  },
  types_of_repairs: {
    select: { id: true, name: true },
  },
  // Grupo de reparaciones del que salio el item, para marcarlo en los listados
  maintenance_request_groups: {
    select: { id: true, name: true },
  },
  maintenance_request_items: {
    include: {
      maintenance_request_groups: {
        select: { id: true, name: true },
      },
      checklist_deviations: {
        select: {
          id: true,
          item_code: true,
          item_label: true,
          section_code: true,
          driver_comment: true,
          checklist_answers: {
            select: {
              id: true,
              answer_data: true,
              employees: {
                select: { id: true, firstname: true, lastname: true },
              },
              profile: {
                select: { id: true, fullname: true, email: true },
              },
            },
          },
        },
      },
    },
  },
} as const;

// ─── Funciones READ ─────────────────────────────────────────────────────────

/**
 * Obtiene los pedidos de mantenimiento con filtros opcionales
 * @deprecated Usar getMaintenanceOrdersPending o getMaintenanceOrdersConfirmed
 */
export async function getMaintenanceOrders(filters?: MaintenanceOrderFilters) {
  'use cache';
  cacheTag(CACHE_TAGS.MAINTENANCE_ORDERS, CACHE_TAGS.TAB_PEDIDOS_PENDIENTES);

  serverLogger.debug('Obteniendo pedidos de mantenimiento', { data: { filters } });

  try {
    const where = {
      status: { in: ['pending_scheduling', 'date_confirmed'] },
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.equipment_id ? { equipment_id: filters.equipment_id } : {}),
      ...(filters?.scheduled_from ? { scheduled_date: { gte: new Date(filters.scheduled_from) } } : {}),
      ...(filters?.scheduled_to
        ? {
            scheduled_date: {
              ...(filters?.scheduled_from ? { gte: new Date(filters.scheduled_from) } : {}),
              lte: new Date(filters.scheduled_to),
            },
          }
        : {}),
    };

    const data = await prisma.maintenance_orders.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        equipment_id: true,
        status: true,
        scheduled_date: true,
        scheduled_by: true,
        scheduled_at: true,
        rejection_reason: true,
        rejected_at: true,
        workshop_entry_date: true,
        workshop_approved_by: true,
        kilometer_at_entry: true,
        engine_hours_at_entry: true,
        created_at: true,
        updated_at: true,
        date_approved_at: true,
        date_approved_by: true,
        date_rejected_at: true,
        date_rejected_by: true,
        date_rejection_reason: true,
        source: true,
        order_number: true,
        description: true,
        workshop_validated_at: true,
        workshop_validation_notes: true,
        operations_validated_by: true,
        operations_validated_at: true,
        operations_validation_notes: true,
        maintenance_request_id: true,
        vehicles: {
          select: {
            id: true,
            domain: true,
            serie: true,
            intern_number: true,
            kilometer: true,
            condition: true,
            engine_hours: true,
          },
        },
        // Ticket 596: el pedido puede ser de un equipamiento en vez de un vehiculo
        other_equipment: {
          select: {
            id: true,
            serial_number: true,
            intern_number: true,
            condition: true,
            horometer: true,
          },
        },
        maintenance_requests: {
          select: {
            id: true,
            kilometer: true,
            engine_hours: true,
            created_at: true,
            source: true,
            preventive_type: true,
            supervisor_id: true,
            description: true,
            profile_maintenance_requests_supervisor_idToprofile: {
              select: { id: true, fullname: true },
            },
          },
        },
        maintenance_order_items: {
          include: MAINTENANCE_ORDER_ITEMS_INCLUDE,
        },
      },
    });

    return data;
  } catch (error) {
    serverLogger.error('Error al obtener pedidos de mantenimiento', { data: { error } });
    throw error;
  }
}

export type MaintenanceOrdersData = Awaited<ReturnType<typeof getMaintenanceOrders>>;
export type MaintenanceOrderData = MaintenanceOrdersData[number];

/**
 * Obtiene los pedidos de mantenimiento pendientes
 * - pending_scheduling: Pendientes de planificar fecha
 * - scheduled: Pendientes de aprobación de fecha (ya planificados)
 *
 * Ordenamiento: pending_scheduling primero, luego scheduled, ambos de más viejo a más reciente
 *
 * FILTRO DE SUPERVISOR:
 * - Usuarios con rol de sistema: ven TODOS los pedidos
 * - Usuarios sin rol de sistema: solo ven pedidos cuya solicitud tiene supervisor_id = su user_id
 */
export async function getMaintenanceOrdersPending() {
  serverLogger.debug('Obteniendo pedidos pendientes');

  try {
    // Obtener información del filtro de supervisor
    const filterInfo = await getSupervisorFilterInfo();

    const data = await prisma.maintenance_orders.findMany({
      where: {
        status: { in: ['pending_scheduling', 'scheduled'] },
        // !inner equivalent: solo pedidos que tienen una maintenance_request asociada
        // Cuando se filtra por supervisor_id, Prisma genera un INNER JOIN implícito
        // Cuando no hay filtro de supervisor, usamos is: {} (existe → isNot null)
        maintenance_requests: filterInfo?.shouldFilterBySupervisor
          ? { supervisor_id: filterInfo.userId }
          : { isNot: undefined },
      },
      orderBy: [
        // pending_scheduling (p) antes que scheduled (s) — desc porque 'p' > 's' alfabéticamente
        { status: 'desc' },
        // Lo ultimo cargado primero
        { created_at: 'desc' },
      ],
      select: {
        id: true,
        equipment_id: true,
        status: true,
        scheduled_date: true,
        scheduled_by: true,
        scheduled_at: true,
        rejection_reason: true,
        rejected_at: true,
        workshop_entry_date: true,
        workshop_approved_by: true,
        kilometer_at_entry: true,
        engine_hours_at_entry: true,
        created_at: true,
        updated_at: true,
        date_approved_at: true,
        date_approved_by: true,
        date_rejected_at: true,
        date_rejected_by: true,
        date_rejection_reason: true,
        source: true,
        order_number: true,
        // Ticket 592: texto del pedido cargado manualmente (lo muestran los dialogos de detalle/entrada)
        description: true,
        workshop_validated_at: true,
        workshop_validation_notes: true,
        operations_validated_by: true,
        operations_validated_at: true,
        operations_validation_notes: true,
        maintenance_request_id: true,
        vehicles: {
          select: {
            id: true,
            domain: true,
            serie: true,
            intern_number: true,
            kilometer: true,
            condition: true,
            engine_hours: true,
          },
        },
        // Ticket 596: el pedido puede ser de un equipamiento en vez de un vehiculo
        other_equipment: {
          select: {
            id: true,
            serial_number: true,
            intern_number: true,
            condition: true,
            horometer: true,
          },
        },
        maintenance_requests: {
          select: {
            id: true,
            kilometer: true,
            engine_hours: true,
            created_at: true,
            supervisor_id: true,
            source: true,
            preventive_type: true,
            description: true,
            profile_maintenance_requests_supervisor_idToprofile: {
              select: { id: true, fullname: true },
            },
          },
        },
        maintenance_order_items: {
          include: MAINTENANCE_ORDER_ITEMS_INCLUDE,
        },
      },
    });

    return data;
  } catch (error) {
    serverLogger.error('Error al obtener pedidos pendientes', { data: { error } });
    throw error;
  }
}

export type MaintenanceOrdersPendingData = Awaited<ReturnType<typeof getMaintenanceOrdersPending>>;

/**
 * Obtiene los pedidos de mantenimiento con fecha confirmada
 * - date_confirmed: Listos para entrada a taller
 *
 * Ordenamiento: de más viejo a más reciente
 *
 * FILTRO DE SUPERVISOR:
 * - Usuarios con rol de sistema: ven TODOS los pedidos
 * - Usuarios sin rol de sistema: solo ven pedidos cuya solicitud tiene supervisor_id = su user_id
 */
export async function getMaintenanceOrdersConfirmed() {
  serverLogger.debug('Obteniendo pedidos confirmados');

  try {
    // Obtener información del filtro de supervisor
    const filterInfo = await getSupervisorFilterInfo();

    const data = await prisma.maintenance_orders.findMany({
      where: {
        status: 'date_confirmed',
        // !inner equivalent: solo pedidos que tienen una maintenance_request asociada
        // Cuando se filtra por supervisor_id, Prisma genera un INNER JOIN implícito
        // Cuando no hay filtro de supervisor, omitimos la condición (todos los pedidos confirmados)
        ...(filterInfo?.shouldFilterBySupervisor ? { maintenance_requests: { supervisor_id: filterInfo.userId } } : {}),
      },
      orderBy: { created_at: 'desc' }, // Lo ultimo cargado primero
      select: {
        id: true,
        equipment_id: true,
        status: true,
        scheduled_date: true,
        scheduled_by: true,
        scheduled_at: true,
        rejection_reason: true,
        rejected_at: true,
        workshop_entry_date: true,
        workshop_approved_by: true,
        kilometer_at_entry: true,
        engine_hours_at_entry: true,
        created_at: true,
        updated_at: true,
        date_approved_at: true,
        date_approved_by: true,
        date_rejected_at: true,
        date_rejected_by: true,
        date_rejection_reason: true,
        source: true,
        order_number: true,
        // Ticket 592: texto del pedido cargado manualmente (lo muestran los dialogos de detalle/entrada)
        description: true,
        workshop_validated_at: true,
        workshop_validation_notes: true,
        operations_validated_by: true,
        operations_validated_at: true,
        operations_validation_notes: true,
        maintenance_request_id: true,
        vehicles: {
          select: {
            id: true,
            domain: true,
            serie: true,
            intern_number: true,
            kilometer: true,
            condition: true,
            engine_hours: true,
          },
        },
        // Ticket 596: el pedido puede ser de un equipamiento en vez de un vehiculo
        other_equipment: {
          select: {
            id: true,
            serial_number: true,
            intern_number: true,
            condition: true,
            horometer: true,
          },
        },
        maintenance_requests: {
          select: {
            id: true,
            kilometer: true,
            engine_hours: true,
            created_at: true,
            supervisor_id: true,
            source: true,
            preventive_type: true,
            description: true,
            profile_maintenance_requests_supervisor_idToprofile: {
              select: { id: true, fullname: true },
            },
          },
        },
        maintenance_order_items: {
          include: MAINTENANCE_ORDER_ITEMS_INCLUDE_WITH_ANSWER_DATA,
        },
      },
    });

    return data;
  } catch (error) {
    serverLogger.error('Error al obtener pedidos confirmados', { data: { error } });
    throw error;
  }
}

export type MaintenanceOrdersConfirmedData = Awaited<ReturnType<typeof getMaintenanceOrdersConfirmed>>;

/**
 * Obtiene un pedido de mantenimiento por ID
 */
export async function getMaintenanceOrderById(orderId: string) {
  'use cache';
  cacheTag(CACHE_TAGS.MAINTENANCE_ORDERS);

  serverLogger.debug('Obteniendo pedido por ID', { data: { orderId } });

  try {
    const data = await prisma.maintenance_orders.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        equipment_id: true,
        status: true,
        scheduled_date: true,
        scheduled_by: true,
        scheduled_at: true,
        rejection_reason: true,
        rejected_at: true,
        workshop_entry_date: true,
        workshop_approved_by: true,
        kilometer_at_entry: true,
        engine_hours_at_entry: true,
        created_at: true,
        updated_at: true,
        date_approved_at: true,
        date_approved_by: true,
        date_rejected_at: true,
        date_rejected_by: true,
        date_rejection_reason: true,
        source: true,
        order_number: true,
        description: true,
        workshop_validated_at: true,
        workshop_validation_notes: true,
        operations_validated_by: true,
        operations_validated_at: true,
        operations_validation_notes: true,
        maintenance_request_id: true,
        vehicles: {
          select: {
            id: true,
            domain: true,
            serie: true,
            intern_number: true,
            kilometer: true,
            condition: true,
            engine_hours: true,
          },
        },
        // Ticket 596: el pedido puede ser de un equipamiento en vez de un vehiculo
        other_equipment: {
          select: {
            id: true,
            serial_number: true,
            intern_number: true,
            condition: true,
            horometer: true,
          },
        },
        maintenance_requests: {
          select: {
            id: true,
            kilometer: true,
            engine_hours: true,
            created_at: true,
            source: true,
            preventive_type: true,
            supervisor_id: true,
            description: true,
            profile_maintenance_requests_supervisor_idToprofile: {
              select: { id: true, fullname: true },
            },
          },
        },
        maintenance_order_items: {
          include: MAINTENANCE_ORDER_ITEMS_INCLUDE,
        },
      },
    });

    if (!data) {
      serverLogger.warn('Pedido no encontrado', { data: { orderId } });
    }

    return data;
  } catch (error) {
    serverLogger.error('Error al obtener pedido por ID', { data: { error, orderId } });
    throw error;
  }
}

// ─── Funciones WRITE ─────────────────────────────────────────────────────────

/**
 * Planifica un pedido de mantenimiento asignando una fecha.
 *
 * La fecha que programa el taller es directamente la fecha de reparacion: ya no
 * requiere aprobacion de Operaciones, por eso el pedido queda en 'date_confirmed'
 * y pasa directo al paso "Por Ingresar" del taller.
 */
export async function scheduleMaintenanceOrder(input: ScheduleOrderInput) {
  serverLogger.info('Planificando pedido de mantenimiento', {
    data: { orderId: input.orderId, scheduledDate: input.scheduledDate },
  });

  // Obtener el perfil del usuario actual para scheduled_by
  const profile = await requireServerAuthProfile();

  try {
    // Transaccion: el update y el registro de actividad van juntos para que el
    // historial nunca quede sin el evento "fecha programada" (lo reclamo el cliente).
    const data = await withMaintenanceActor(profile.id, async (tx) => {
      const previous = await tx.maintenance_orders.findUnique({
        where: { id: input.orderId },
        select: { status: true },
      });

      await assertOrderTransition(tx, input.orderId, 'date_confirmed');
      const updated = await tx.maintenance_orders.update({
        where: { id: input.orderId },
        data: {
          status: 'date_confirmed',
          scheduled_date: input.scheduledDate ? new Date(input.scheduledDate) : null,
          scheduled_by: profile.id,
          scheduled_at: new Date(),
        },
      });

      await logActivity(tx, {
        maintenanceOrderId: updated.id,
        actionType: ACTIVITY_LOG.SCHEDULED,
        performedBy: profile.id,
        previousStatus: previous?.status ?? null,
        newStatus: 'date_confirmed',
        metadata: {
          // `scheduled_date` es `@db.Date`: 'YYYY-MM-DD'. El historial lo formatea con moment al
          // renderizar, y con el ISO completo (medianoche UTC) mostraba el dia anterior en UTC-3.
          scheduled_date: toDateOnly(updated.scheduled_date),
        },
      });

      return updated;
    });

    serverLogger.info('Pedido planificado exitosamente', { data: { orderId: input.orderId } });

    await invalidateCacheTags(INVALIDATION_MAP.scheduleMaintenanceOrder);

    return data;
  } catch (error) {
    serverLogger.error('Error al planificar pedido', { data: { error, orderId: input.orderId } });
    throw error;
  }
}

/**
 * Rechaza un pedido de mantenimiento desde el paso "Por Programar" del taller.
 *
 * Ticket 676: una vez que Operaciones aprueba la solicitud, el taller no tenia
 * forma de rechazar el pedido. El caso tipico es la solicitud cargada dos veces
 * (doble clic): en vez de bloquear la carga duplicada, el taller la rechaza
 * indicando el motivo, que es obligatorio.
 *
 * Reutiliza el mecanismo de rechazo del modulo (status + rejection_reason +
 * rejected_by + rejected_at) y registra el evento en el historial de actividad.
 *
 * El rechazo se propaga a la solicitud de origen para que el pedido quede
 * registrado en el historial de mantenimiento del equipo, en la sub-tab
 * "Solicitudes Rechazadas", junto a las que rechazo el supervisor en
 * Operaciones. Los pedidos sin solicitud asociada (preventivos creados
 * directamente) solo quedan en la sub-tab "Ordenes de Mantenimiento".
 */
export async function rejectPendingOrder(input: RejectPendingOrderInput) {
  const reason = input.reason.trim();

  if (!reason) {
    throw new Error('El motivo del rechazo es obligatorio');
  }

  serverLogger.info('Rechazando pedido de mantenimiento', { data: { orderId: input.orderId } });

  const profile = await requireServerAuthProfile();

  try {
    const data = await withMaintenanceActor(profile.id, async (tx) => {
      // Lock primero: la guarda de abajo mira los pedidos de materiales abiertos, y el alta de un
      // pedido tambien lockea la orden (Almacenes etapa 4).
      await lockMaintenanceOrder(tx, input.orderId);
      const current = await tx.maintenance_orders.findUnique({
        where: { id: input.orderId },
        select: { status: true, maintenance_request_id: true },
      });

      if (!current) {
        throw new Error('Pedido no encontrado');
      }

      // Guarda: el rechazo del taller solo aplica al paso "Por Programar".
      // Si el pedido ya avanzo (fecha confirmada, en taller) el circuito tiene
      // sus propios mecanismos y este no debe pisarlos.
      if (current.status !== 'pending_scheduling') {
        throw new Error('Solo se pueden rechazar pedidos pendientes de programar');
      }

      const rejectedAt = new Date();

      await assertOrderTransition(tx, input.orderId, 'rejected');
      const updated = await tx.maintenance_orders.update({
        where: { id: input.orderId },
        data: {
          status: 'rejected',
          rejection_reason: reason,
          rejected_by: profile.id,
          rejected_at: rejectedAt,
          updated_at: rejectedAt,
        },
      });

      if (current.maintenance_request_id) {
        await tx.maintenance_requests.update({
          where: { id: current.maintenance_request_id },
          data: {
            status: 'rejected',
            rejection_reason: reason,
            rejected_by: profile.id,
            rejected_at: rejectedAt,
          },
        });
      }

      // Solo contra el pedido: el historial combina los registros de la solicitud
      // y los del pedido, asi que cargar los dos ids duplicaria la entrada.
      await logActivity(tx, {
        maintenanceOrderId: updated.id,
        actionType: ACTIVITY_LOG.REJECTED,
        performedBy: profile.id,
        previousStatus: current.status,
        newStatus: 'rejected',
        rejectionReason: reason,
        metadata: { rejected_from: 'pedidos_pendientes' },
      });

      return updated;
    });

    serverLogger.info('Pedido rechazado', { data: { orderId: input.orderId } });

    await invalidateCacheTags(INVALIDATION_MAP.rejectPendingOrder);

    return data;
  } catch (error) {
    serverLogger.error('Error al rechazar pedido', { data: { error, orderId: input.orderId } });
    throw error;
  }
}

/**
 * Aprueba la entrada a taller de un pedido de mantenimiento
 * - Actualiza el estado del pedido a 'in_workshop'
 * - Actualiza el kilometraje y condición del vehículo a 'no_operativo'
 * - Usa transacción para garantizar atomicidad
 */
export async function approveWorkshopEntryFromOrder(input: ApproveWorkshopEntryInput) {
  serverLogger.info('Aprobando entrada a taller', {
    data: { orderId: input.orderId, kilometer: input.kilometer },
  });

  // Obtener el perfil del usuario actual para workshop_approved_by
  const profile = await requireServerAuthProfile();

  try {
    // Obtener el pedido para saber el equipment_id
    const order = await prisma.maintenance_orders.findUnique({
      where: { id: input.orderId },
      select: { equipment_id: true, other_equipment_id: true },
    });

    if (!order) {
      const errorMsg = 'Pedido no encontrado';
      serverLogger.error(errorMsg, { data: { orderId: input.orderId } });
      throw new Error(errorMsg);
    }

    // Transacción atómica: actualizar pedido + recurso simultáneamente.
    // El pedido es de un vehículo o de un equipamiento (ticket 596): los
    // equipamientos no llevan kilometraje, y sus horas van en `horometer`.
    await withMaintenanceActor(profile.id, async (tx) => {
      await assertOrderTransition(tx, input.orderId, 'in_workshop');
      await tx.maintenance_orders.update({
        where: { id: input.orderId },
        data: {
          status: 'in_workshop',
          workshop_entry_date: new Date(),
          workshop_approved_by: profile.id,
        },
      });

      if (order.equipment_id) {
        await tx.vehicles.update({
          where: { id: order.equipment_id },
          data: {
            ...(input.kilometer ? { kilometer: input.kilometer } : {}),
            condition: 'no_operativo',
            ...(input.engine_hours ? { engine_hours: input.engine_hours } : {}),
          },
        });
      }

      if (order.other_equipment_id) {
        await tx.other_equipment.update({
          where: { id: order.other_equipment_id },
          data: {
            condition: 'no_operativo',
            ...(input.engine_hours ? { horometer: Number(input.engine_hours) } : {}),
          },
        });
      }
    });

    // Generar número de orden de mantenimiento (OM-DOMAIN-XXXXXX)
    // NOTA: generateMaintenanceOrderNumber pertenece a OrderManagement, se migra en su propio PR
    await generateMaintenanceOrderNumber(input.orderId);

    serverLogger.info('Entrada a taller aprobada exitosamente', { data: { orderId: input.orderId } });

    await invalidateCacheTags(INVALIDATION_MAP.approveWorkshopEntry);

    return { success: true };
  } catch (error) {
    serverLogger.error('Error al aprobar entrada a taller', { data: { error, orderId: input.orderId } });
    throw error;
  }
}
