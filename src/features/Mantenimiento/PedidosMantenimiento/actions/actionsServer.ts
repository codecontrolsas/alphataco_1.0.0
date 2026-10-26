'use server';

import { refreshDocumentStatus } from '@/features/Documentacion/shared/compliance/server/document-status.server';
import { ACTIVITY_LOG } from '@/features/Mantenimiento/shared/activity-log/action-types';
import { logActivity } from '@/features/Mantenimiento/shared/activity-log/log-activity';
import { withMaintenanceActor } from '@/features/Mantenimiento/shared/maintenance-actor';
import { lockMaintenanceOrder } from '@/features/Mantenimiento/shared/order-lock';
import { nextMaintenanceOrderNumber } from '@/features/Mantenimiento/shared/order-numbering';
import { transitionMaintenanceOrder } from '@/features/Mantenimiento/shared/order-transition';
import { requireMaintenancePermission } from '@/features/Mantenimiento/shared/permissions.server';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { CACHE_TAGS } from '@/shared/constants/cache';
import { INVALIDATION_MAP } from '@/shared/constants/cache-invalidation-map';
import { toDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { runInCompanyScope } from '@/shared/lib/tenant-context';
import { invalidateCacheTags } from '@/shared/utils/cache-invalidation';
import { cacheTag } from 'next/cache';
import { z } from 'zod';
import { assertOrderInActiveCompany } from '../../MaintenanceOrders/actions/order-perimeter';
import type { ApproveWorkshopEntryInput, RejectPendingOrderInput, ScheduleOrderInput } from '../../types';

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

// ─── Funciones READ ─────────────────────────────────────────────────────────

/**
 * Lectura cacheada de un pedido, acotada a una empresa.
 *
 * La empresa llega por parámetro porque una función `'use cache'` no puede leer la sesión: el
 * wrapper exportado la resuelve y la pasa acá (además entra en la clave del cache).
 */
async function getCachedMaintenanceOrderById(orderId: string, companyId: string) {
  'use cache';
  cacheTag(CACHE_TAGS.MAINTENANCE_ORDERS);
  return runInCompanyScope(companyId, () => getCachedMaintenanceOrderByIdQuery(orderId, companyId));
}

/** Cuerpo de `getCachedMaintenanceOrderById`: corre dentro de `runInCompanyScope` (la RLS necesita la empresa). */
async function getCachedMaintenanceOrderByIdQuery(orderId: string, companyId: string) {
  serverLogger.debug('Obteniendo pedido por ID', { data: { orderId } });

  try {
    const data = await prisma.maintenance_orders.findFirst({
      where: { id: orderId, company_id: companyId },
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

/**
 * Obtiene un pedido de mantenimiento por ID, acotado a la empresa activa.
 * Se abre desde Pedidos pendientes / confirmados (y el seguimiento): exige `view` en alguna.
 */
export async function getMaintenanceOrderById(orderId: string) {
  await requireMaintenancePermission(
    ['pedidos_pendientes', 'pedidos_confirmados', 'seguimiento_taller', 'ordenes_mantenimiento'],
    'view'
  );
  const companyId = await getActiveCompanyId();
  return getCachedMaintenanceOrderById(orderId, companyId);
}

// Pedido con items, solicitud y equipo (forma que consumen los diálogos de pedidos)
export type MaintenanceOrderData = NonNullable<Awaited<ReturnType<typeof getMaintenanceOrderById>>>;

// ─── Funciones WRITE ─────────────────────────────────────────────────────────

const orderIdSchema = z.string().uuid('Identificador de pedido inválido');

const scheduleOrderSchema = z.object({
  orderId: orderIdSchema,
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de reparación es inválida'),
});

const rejectPendingOrderSchema = z.object({
  orderId: orderIdSchema,
  reason: z.string().trim().min(1, 'El motivo del rechazo es obligatorio').max(2000),
});

/** Kilometraje / horas: número no negativo escrito como texto (así lo guardan `vehicles`). */
const meterSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, 'El valor debe ser un número positivo')
    .optional()
);

const approveWorkshopEntrySchema = z.object({
  orderId: orderIdSchema,
  kilometer: meterSchema,
  engine_hours: meterSchema,
});

/** `true` si el valor nuevo es MENOR que el actual (el contador no puede retroceder). */
function meterGoesBackwards(current: string | number | null | undefined, next: string | undefined): boolean {
  if (!next) return false;
  const currentValue = Number(current ?? 0);
  if (!Number.isFinite(currentValue)) return false;
  return Number(next) < currentValue;
}

/**
 * Planifica un pedido de mantenimiento asignando una fecha.
 *
 * La fecha que programa el taller es directamente la fecha de reparacion: ya no
 * requiere aprobacion de Operaciones, por eso el pedido queda en 'date_confirmed'
 * y pasa directo al paso "Por Ingresar" del taller.
 *
 * Permiso: `pedidos_pendientes:update`. Perímetro: el pedido es de la empresa activa.
 */
export async function scheduleMaintenanceOrder(input: ScheduleOrderInput) {
  const parsed = scheduleOrderSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Los datos enviados son inválidos');
  const { orderId, scheduledDate } = parsed.data;

  await requireMaintenancePermission('pedidos_pendientes', 'update');
  await assertOrderInActiveCompany(orderId);

  serverLogger.info('Planificando pedido de mantenimiento', { data: { orderId, scheduledDate } });

  // Obtener el perfil del usuario actual para scheduled_by
  const profile = await requireServerAuthProfile();

  try {
    // Transaccion: el update y el registro de actividad van juntos para que el
    // historial nunca quede sin el evento "fecha programada" (lo reclamo el cliente).
    const data = await withMaintenanceActor(profile.id, async (tx) => {
      const previousStatus = await transitionMaintenanceOrder(tx, orderId, 'date_confirmed', {
        scheduled_date: new Date(scheduledDate),
        scheduled_by: profile.id,
        scheduled_at: new Date(),
      });

      const updated = await tx.maintenance_orders.findUniqueOrThrow({ where: { id: orderId } });

      await logActivity(tx, {
        maintenanceOrderId: updated.id,
        actionType: ACTIVITY_LOG.SCHEDULED,
        performedBy: profile.id,
        previousStatus,
        newStatus: 'date_confirmed',
        metadata: {
          // `scheduled_date` es `@db.Date`: 'YYYY-MM-DD'. El historial lo formatea con moment al
          // renderizar, y con el ISO completo (medianoche UTC) mostraba el dia anterior en UTC-3.
          scheduled_date: toDateOnly(updated.scheduled_date),
        },
      });

      return updated;
    });

    serverLogger.info('Pedido planificado exitosamente', { data: { orderId } });

    await invalidateCacheTags(INVALIDATION_MAP.scheduleMaintenanceOrder);

    return data;
  } catch (error) {
    serverLogger.error('Error al planificar pedido', { data: { error, orderId } });
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
 *
 * Permiso: `pedidos_pendientes:update`. Perímetro: el pedido (y su solicitud) son de la empresa activa.
 */
export async function rejectPendingOrder(input: RejectPendingOrderInput) {
  const parsed = rejectPendingOrderSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Los datos enviados son inválidos');
  const { orderId, reason } = parsed.data;

  await requireMaintenancePermission('pedidos_pendientes', 'update');
  const companyId = await assertOrderInActiveCompany(orderId);

  serverLogger.info('Rechazando pedido de mantenimiento', { data: { orderId } });

  const profile = await requireServerAuthProfile();

  try {
    const data = await withMaintenanceActor(profile.id, async (tx) => {
      // Lock primero: la guarda de abajo mira los pedidos de materiales abiertos, y el alta de un
      // pedido tambien lockea la orden (Almacenes etapa 4).
      await lockMaintenanceOrder(tx, orderId);
      const current = await tx.maintenance_orders.findFirst({
        where: { id: orderId, company_id: companyId },
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

      await transitionMaintenanceOrder(tx, orderId, 'rejected', {
        rejection_reason: reason,
        rejected_by: profile.id,
        rejected_at: rejectedAt,
        updated_at: rejectedAt,
      });

      if (current.maintenance_request_id) {
        // Atado a la empresa y al estado: solo se cierra una solicitud que sigue abierta.
        await tx.maintenance_requests.updateMany({
          where: { id: current.maintenance_request_id, company_id: companyId },
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
        maintenanceOrderId: orderId,
        actionType: ACTIVITY_LOG.REJECTED,
        performedBy: profile.id,
        previousStatus: current.status,
        newStatus: 'rejected',
        rejectionReason: reason,
        metadata: { rejected_from: 'pedidos_pendientes' },
      });

      return tx.maintenance_orders.findUniqueOrThrow({ where: { id: orderId } });
    });

    serverLogger.info('Pedido rechazado', { data: { orderId } });

    await invalidateCacheTags(INVALIDATION_MAP.rejectPendingOrder);

    return data;
  } catch (error) {
    serverLogger.error('Error al rechazar pedido', { data: { error, orderId } });
    throw error;
  }
}

/**
 * Aprueba la entrada a taller de un pedido de mantenimiento
 * - Actualiza el estado del pedido a 'in_workshop'
 * - Actualiza el kilometraje y condición del vehículo a 'no_operativo'
 * - Genera el número de orden (OM-XXXXXX) si todavía no lo tiene
 *
 * TODO ocurre en una sola transacción, con el pedido lockeado y el perímetro validado ANTES de
 * escribir el recurso: antes el vehículo se actualizaba primero y recién después una segunda
 * action validaba la empresa (la escritura cruzada quedaba commiteada), y el número de orden se
 * generaba fuera de la transacción (si fallaba, la orden quedaba en taller sin número).
 *
 * Permiso: `pedidos_confirmados:update`.
 */
export async function approveWorkshopEntryFromOrder(input: ApproveWorkshopEntryInput) {
  const parsed = approveWorkshopEntrySchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Los datos enviados son inválidos');
  const { orderId, kilometer, engine_hours: engineHours } = parsed.data;

  await requireMaintenancePermission('pedidos_confirmados', 'update');
  const companyId = await assertOrderInActiveCompany(orderId);

  serverLogger.info('Aprobando entrada a taller', { data: { orderId, kilometer } });

  // Obtener el perfil del usuario actual para workshop_approved_by
  const profile = await requireServerAuthProfile();

  try {
    // Transacción atómica: pedido + recurso + número de orden. El pedido es de un vehículo o de un
    // equipamiento (ticket 596): los equipamientos no llevan kilometraje, y sus horas van en
    // `horometer`.
    await withMaintenanceActor(profile.id, async (tx) => {
      await lockMaintenanceOrder(tx, orderId);

      const order = await tx.maintenance_orders.findFirst({
        where: { id: orderId, company_id: companyId },
        select: { equipment_id: true, other_equipment_id: true, order_number: true },
      });

      if (!order) throw new Error('Pedido no encontrado');

      // Los contadores del cliente no pueden retroceder respecto del valor actual del recurso.
      if (order.equipment_id) {
        const vehicle = await tx.vehicles.findFirst({
          where: { id: order.equipment_id, company_id: companyId },
          select: { kilometer: true, engine_hours: true },
        });
        if (!vehicle) throw new Error('El equipo del pedido no pertenece a la empresa activa');
        if (meterGoesBackwards(vehicle.kilometer, kilometer)) {
          throw new Error(`El kilometraje no puede ser menor al actual (${vehicle.kilometer})`);
        }
        if (meterGoesBackwards(vehicle.engine_hours, engineHours)) {
          throw new Error(`Las horas de motor no pueden ser menores a las actuales (${vehicle.engine_hours})`);
        }
      }

      if (order.other_equipment_id) {
        const equipment = await tx.other_equipment.findFirst({
          where: { id: order.other_equipment_id, company_id: companyId },
          select: { horometer: true },
        });
        if (!equipment) throw new Error('El equipamiento del pedido no pertenece a la empresa activa');
        if (meterGoesBackwards(equipment.horometer?.toString(), engineHours)) {
          throw new Error(`El horómetro no puede ser menor al actual (${equipment.horometer?.toString()})`);
        }
      }

      await transitionMaintenanceOrder(tx, orderId, 'in_workshop', {
        workshop_entry_date: new Date(),
        workshop_approved_by: profile.id,
      });

      if (order.equipment_id) {
        await tx.vehicles.update({
          where: { id: order.equipment_id },
          data: {
            ...(kilometer ? { kilometer } : {}),
            condition: 'no_operativo',
            ...(engineHours ? { engine_hours: engineHours } : {}),
          },
        });
        // `condition` es condición registrada de los tipos de documento de equipos: refresca el cache de status.
        await refreshDocumentStatus(tx, 'Equipos', { ids: [order.equipment_id] });
      }

      if (order.other_equipment_id) {
        await tx.other_equipment.update({
          where: { id: order.other_equipment_id },
          data: {
            condition: 'no_operativo',
            ...(engineHours ? { horometer: Number(engineHours) } : {}),
          },
        });
      }

      // Número de orden (OM-XXXXXX): dentro de la misma transacción, con advisory lock por empresa.
      if (!order.order_number) {
        const generated = await nextMaintenanceOrderNumber(tx, companyId);
        await tx.maintenance_orders.update({ where: { id: orderId }, data: { order_number: generated } });
        await logActivity(tx, {
          maintenanceOrderId: orderId,
          actionType: ACTIVITY_LOG.ORDER_NUMBER_GENERATED,
          performedBy: profile.id,
          metadata: { orderNumber: generated },
        });
      }
    });

    serverLogger.info('Entrada a taller aprobada exitosamente', { data: { orderId } });

    await invalidateCacheTags(INVALIDATION_MAP.approveWorkshopEntry);

    return { success: true };
  } catch (error) {
    serverLogger.error('Error al aprobar entrada a taller', { data: { error, orderId } });
    throw error;
  }
}
