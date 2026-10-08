/**
 * Alimenta el PDF de Orden de Mantenimiento (ticket 684) con datos reales.
 *
 * Este modulo NO importa nada de `@react-pdf/renderer` ni del layout: solo arma
 * el modelo de vista `MaintenanceOrderReportData`. El layout se carga aparte, en
 * el cliente y bajo demanda, para que react-pdf no entre en el bundle inicial de
 * la tabla.
 *
 * Vive separado de `actions.server.ts` (que es solo el borde: resuelve al usuario
 * autenticado y delega) para que la consulta y el mapeo se puedan ejecutar fuera
 * de Next: asi el PDF se puede regenerar con datos reales y mirar rasterizado,
 * sin levantar la app ni loguearse.
 *
 * ── De donde sale cada dato (verificado contra dev, 2026-09-11) ──────────────
 *
 * - **Estado y cierre de cada tarea: `work_order_item_repairs`**, no
 *   `work_order_items`. La tabla que por nombre parece la indicada esta muerta:
 *   sus 2182 filas estan TODAS en `pending` y `completed_at` es siempre null —
 *   el circuito nunca la cierra. El avance real lo marca el taller sobre
 *   `work_order_item_repairs` (2713 filas `completed`, todas con `completed_at`).
 *
 * - **Ejecucion de la OT: `started_at` / `completed_at`**, no
 *   `actual_start_date` / `actual_end_date`: esas dos columnas no se escriben en
 *   ninguna fila de la base (0 de 948 OT). `started_at` esta poblado en las 935
 *   OT iniciadas y vacio en las 13 `pending`, que es exactamente lo esperado.
 *
 * - **Cierre de la orden**: el ultimo `completed_at` de sus OT, por lo mismo.
 *
 * - **Hitos de trazabilidad**: `maintenance_activity_log`, la misma fuente que
 *   consume `ActivityHistoryModal` (via `getMaintenanceOrderFullActivityLog`).
 *   Se recorre el circuito completo y se emite una fila por hito **aunque no
 *   haya ocurrido**: en un registro de auditoria el paso faltante es el dato.
 *   Cuando el log no tiene el evento se cae a las columnas de la propia orden,
 *   que es lo que las ordenes viejas conservan.
 *
 * - **Etiquetas de estado**: se resuelven aca y viajan como texto. Los mapas del
 *   modulo acoplan la etiqueta a un icono de lucide y a una variante de Badge,
 *   inservibles en un PDF; importarlos desde el layout arrastraria lucide al
 *   bundle. Se importan aca (server) y al layout llega solo el `label`.
 */

import {
  getMoStatusConfig,
  getWoStatusConfig,
} from '@/features/Mantenimiento/WorkshopView/WorkshopSectorTasksTable/work-order-status';
import { getResourceKindLabel } from '@/features/Mantenimiento/shared/maintenance-resource';
import { PREVENTIVE_TYPES, SOURCE_LABELS_EXTENDED } from '@/features/Mantenimiento/shared/preventive-maintenance';
import {
  WORK_ORDER_ITEM_STATUS_LABELS,
  WORK_ORDER_PRIORITY_LABELS,
  type WorkOrderItemStatus,
  type WorkOrderPriority,
} from '@/features/Mantenimiento/shared/work-order-types';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import moment from 'moment';
import { getDeliveredMaterials } from '../lib/order-materials';
import type { MaintenanceOrderReportData, ReportMaterial, ReportMilestone, ReportTask, ReportWorkOrder } from './types';

const logger = new Logger('MaintenanceOrders/pdf/report-data');

const quantityFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 });
const moneyFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });

// ============================================================================
// CONSTANTES DEL DOCUMENTO
// ============================================================================

/** Codigo y revision del registro, como en el resto de los formularios del sistema. */
const DOCUMENT_CODE = 'RG MT-08';
const DOCUMENT_REVISION = '1';

/**
 * Variante JPEG aplanada sobre blanco del logo institucional.
 * El PNG con canal alpha se maqueta mal en react-pdf (proporcion equivocada y
 * hueco de altura), asi que la pantalla usa el PNG y el papel este archivo.
 */
const LOGO_SRC: string | undefined = undefined;

/** Nombre de empresa de respaldo cuando el recurso no tiene empresa resuelta. */
const FALLBACK_COMPANY_NAME = 'alphataco';

/**
 * Circuito de la orden, en el orden en que ocurre.
 *
 * Cada hito se resuelve primero contra `maintenance_activity_log` (el evento
 * real, con su autor y su nota) y, si el log no lo tiene, contra las columnas de
 * la orden. Los `actionType` son constantes de `shared/activity-log/action-types`;
 * se listan como literales para no acoplar el documento al catalogo completo.
 */
const MILESTONE_STEPS = [
  { label: 'Solicitud generada', actionType: 'created' },
  { label: 'Planificación', actionType: 'scheduled' },
  { label: 'Fecha confirmada', actionType: 'date_confirmed' },
  { label: 'Ingreso a taller', actionType: 'workshop_entry' },
  { label: 'Órdenes de trabajo generadas', actionType: 'work_orders_generated' },
  { label: 'Validación de taller', actionType: 'workshop_approved' },
  { label: 'Validación de Operaciones', actionType: 'operations_approved' },
] as const;

// ============================================================================
// SELECTS
// ============================================================================

const ACTIVITY_LOG_SELECT = {
  action_type: true,
  performed_at: true,
  notes: true,
  rejection_reason: true,
  profile: { select: { fullname: true } },
} as const;

/** Datos de identificacion de un vehiculo, para el bloque de equipo. */
const VEHICLE_SELECT = {
  domain: true,
  serie: true,
  intern_number: true,
  year: true,
  kilometer: true,
  engine_hours: true,
  company: { select: { company_name: true } },
  type_vehicles_typeTotype: { select: { name: true } },
  sub_type: { select: { name: true } },
  brand_vehicles: { select: { name: true } },
  model_vehicles: { select: { name: true } },
  hierarchy: { select: { name: true } },
} as const;

/** Mismo bloque para un equipamiento (`other_equipment`). */
const OTHER_EQUIPMENT_SELECT = {
  serial_number: true,
  intern_number: true,
  year: true,
  horometer: true,
  company: { select: { company_name: true } },
  type: { select: { name: true } },
  sub_type: { select: { name: true } },
  brand_vehicles: { select: { name: true } },
  model_vehicles: { select: { name: true } },
  hierarchy: { select: { name: true } },
} as const;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Columna `@db.Date` (fecha sin hora) a texto `YYYY-MM-DD`.
 *
 * Prisma devuelve una fecha sin hora como un `Date` a medianoche **UTC**. El PDF
 * se renderiza en el navegador del usuario (UTC-3), asi que formatear ese `Date`
 * con la hora local retrocede un dia: una OT planificada para el 21/04 se
 * imprimia 20/04. Como texto plano, `formatDate` la lee con `moment.parseZone` y
 * no la mueve. Solo aplica a las columnas de tipo date — las `timestamptz` son
 * instantes reales y se pasan tal cual.
 */
function toPlainDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return moment.utc(value).format('YYYY-MM-DD');
}

/** Texto util o null: un string vacio en la base es ausencia, no un valor. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Numero guardado como texto (kilometraje, horometro) con separador es-AR. */
function formatMeasure(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const raw = typeof value === 'number' ? value : value.trim();
  if (raw === '' || raw === '0') return null;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) return String(raw);
  return new Intl.NumberFormat('es-AR').format(parsed);
}

/** Origen del pedido, con el mismo vocabulario que las tablas del modulo. */
function resolveSourceLabel(source: string | null): string | null {
  if (!source) return null;
  return SOURCE_LABELS_EXTENDED[source] ?? source;
}

/** Programa preventivo al que responde la orden, cuando aplica. */
function resolvePreventiveType(preventiveType: string | null): string | null {
  if (!preventiveType) return null;
  return PREVENTIVE_TYPES[preventiveType as keyof typeof PREVENTIVE_TYPES] ?? preventiveType;
}

/** Etiqueta del estado de una tarea (`work_order_item_status`). */
function resolveTaskStatusLabel(status: string): string {
  return WORK_ORDER_ITEM_STATUS_LABELS[status as WorkOrderItemStatus] ?? status;
}

/** Etiqueta de la prioridad de una OT (`work_order_priority`). */
function resolvePriorityLabel(priority: string): string {
  return WORK_ORDER_PRIORITY_LABELS[priority as WorkOrderPriority] ?? priority;
}

// ============================================================================
// SERVER ACTION
// ============================================================================

/**
 * Arma el modelo de vista completo del PDF de una orden de mantenimiento.
 *
 * Son tres queries en paralelo y ninguna depende de la anterior: la orden con su
 * equipo y su historial, las ordenes de trabajo con sus tareas anidadas, y el
 * perfil de quien descarga. Todo lo que cuelga de la orden viaja en el mismo
 * arbol de `select`, para que agregar una OT o una tarea no agregue una query.
 *
 * @param issuerUserId Usuario que emite el documento; `null` cuando no hay sesion.
 */
export async function buildMaintenanceOrderReportData(
  orderId: string,
  issuerUserId: string | null,
  /** Costos de los materiales: solo si quien emite tiene permiso de ver precios. */
  options: { withPrices: boolean } = { withPrices: false }
): Promise<MaintenanceOrderReportData> {
  logger.debug('Armando datos del PDF de orden de mantenimiento', { data: { orderId, issuerUserId } });

  try {
    const [order, workOrders, issuer] = await Promise.all([
      prisma.maintenance_orders.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          company_id: true,
          order_number: true,
          status: true,
          source: true,
          preventive_type: true,
          description: true,
          created_at: true,
          scheduled_date: true,
          scheduled_at: true,
          workshop_entry_date: true,
          kilometer_at_entry: true,
          engine_hours_at_entry: true,
          date_approved_at: true,
          date_rejection_reason: true,
          workshop_validated_at: true,
          workshop_validation_notes: true,
          operations_validated_at: true,
          operations_validated_by: true,
          operations_validation_notes: true,
          vehicles: { select: VEHICLE_SELECT },
          other_equipment: { select: OTHER_EQUIPMENT_SELECT },
          profile_maintenance_orders_scheduled_byToprofile: { select: { fullname: true } },
          profile_maintenance_orders_date_approved_byToprofile: { select: { fullname: true } },
          profile_maintenance_orders_workshop_approved_byToprofile: { select: { fullname: true } },
          maintenance_activity_log: {
            select: ACTIVITY_LOG_SELECT,
            orderBy: { performed_at: 'asc' },
          },
          maintenance_requests: {
            select: {
              // Autor y momento reales de la solicitud y de su aprobación: el log
              // de actividad no los tiene confiables (ver hitos más abajo)
              created_at: true,
              approved_at: true,
              profile_maintenance_requests_user_idToprofile: { select: { fullname: true } },
              profile_maintenance_requests_approved_byToprofile: { select: { fullname: true } },
              driver_employee: { select: { file: true, firstname: true, lastname: true } },
              maintenance_activity_log: {
                select: ACTIVITY_LOG_SELECT,
                orderBy: { performed_at: 'asc' },
              },
            },
          },
        },
      }),

      // Las OT de la orden, con sus tareas anidadas. El vinculo va por
      // `work_order_items` (la fila que ata un item del pedido a una OT), que es
      // la unica que sobrevive a una reasignacion de sector.
      prisma.work_orders.findMany({
        where: {
          work_order_items: { some: { maintenance_order_items: { maintenance_order_id: orderId } } },
        },
        orderBy: { sequence_number: 'asc' },
        select: {
          id: true,
          order_number: true,
          status: true,
          priority: true,
          planned_start_date: true,
          planned_end_date: true,
          started_at: true,
          completed_at: true,
          notes: true,
          // Respaldo del hito "Órdenes de trabajo generadas": todas las OT guardan
          // cuándo y quién las creó, aunque el log no tenga el evento
          created_at: true,
          profile_work_orders_created_byToprofile: { select: { fullname: true } },
          workshop_sectors: { select: { name: true } },
          workshops: { select: { name: true, type: true } },
          profile_work_orders_completed_byToprofile: { select: { fullname: true } },
          work_order_items: {
            where: { maintenance_order_items: { maintenance_order_id: orderId } },
            orderBy: { created_at: 'asc' },
            select: {
              maintenance_order_items: {
                select: {
                  description: true,
                  is_critical: true,
                  is_diagnostico: true,
                  is_rejected: true,
                  rejection_reason: true,
                  workshop_chief_comment: true,
                },
              },
              work_order_item_repairs: {
                orderBy: { created_at: 'asc' },
                select: {
                  status: true,
                  completed_at: true,
                  technician_notes: true,
                  rejection_reason: true,
                  return_reason: true,
                  is_diagnostico: true,
                  types_of_repairs: { select: { name: true, type_of_maintenance: true } },
                  profile_work_order_item_repairs_completed_byToprofile: { select: { fullname: true } },
                },
              },
            },
          },
        },
      }),

      issuerUserId
        ? prisma.profile.findUnique({ where: { id: issuerUserId }, select: { fullname: true, email: true } })
        : Promise.resolve(null),
    ]);

    if (!order) {
      throw new Error(`No existe la orden de mantenimiento ${orderId}`);
    }

    // ── Materiales (Almacenes etapa 4) ───────────────────────────────────────
    const delivered = await getDeliveredMaterials(prisma, order.company_id, order.id);
    const materials: ReportMaterial[] = delivered.map((row) => ({
      workOrder: row.workOrderNumber ? [row.workOrderNumber, row.sectorName].filter(Boolean).join(' · ') : null,
      material: `${row.code} · ${row.name}`,
      quantity: `${quantityFormat.format(Number(row.quantity))} ${row.unit}`,
      cost: options.withPrices ? moneyFormat.format(Number(row.totalCost)) : null,
    }));
    const materialsTotal =
      options.withPrices && delivered.length > 0
        ? moneyFormat.format(delivered.reduce((acc, row) => acc + Number(row.totalCost), 0))
        : null;

    // ── Equipo ──────────────────────────────────────────────────────────────
    const vehicle = order.vehicles;
    const otherEquipment = order.other_equipment;
    const isOtherEquipment = Boolean(otherEquipment);

    const companyName =
      clean(vehicle?.company?.company_name) ?? clean(otherEquipment?.company?.company_name) ?? FALLBACK_COMPANY_NAME;

    /**
     * El equipo se mide por kilometraje o por horometro, nunca por los dos: un
     * equipamiento no tiene odometro. Se prioriza lo que la orden capturo al
     * ingresar y, si no lo capturo, la medicion vigente del recurso.
     */
    const engineHoursAtEntry = isOtherEquipment
      ? formatMeasure(order.engine_hours_at_entry) ?? formatMeasure(otherEquipment?.horometer?.toString())
      : formatMeasure(order.engine_hours_at_entry);
    const kilometerAtEntry = engineHoursAtEntry
      ? null
      : formatMeasure(order.kilometer_at_entry) ?? formatMeasure(vehicle?.kilometer);

    const equipment: MaintenanceOrderReportData['equipment'] = {
      kindLabel: getResourceKindLabel({ vehicles: vehicle, other_equipment: otherEquipment }),
      identifier: isOtherEquipment
        ? clean(otherEquipment?.serial_number) ?? clean(otherEquipment?.intern_number) ?? 'Sin identificar'
        : clean(vehicle?.domain) ?? clean(vehicle?.serie) ?? clean(vehicle?.intern_number) ?? 'Sin identificar',
      identifierLabel: isOtherEquipment ? 'N.° de serie' : 'Dominio',
      internalNumber: isOtherEquipment ? clean(otherEquipment?.intern_number) : clean(vehicle?.intern_number),
      type: isOtherEquipment ? clean(otherEquipment?.type?.name) : clean(vehicle?.type_vehicles_typeTotype?.name),
      subType: isOtherEquipment ? clean(otherEquipment?.sub_type?.name) : clean(vehicle?.sub_type?.name),
      brand: isOtherEquipment ? clean(otherEquipment?.brand_vehicles?.name) : clean(vehicle?.brand_vehicles?.name),
      model: isOtherEquipment ? clean(otherEquipment?.model_vehicles?.name) : clean(vehicle?.model_vehicles?.name),
      year: isOtherEquipment ? clean(otherEquipment?.year) : clean(vehicle?.year),
      operationalSector: isOtherEquipment ? clean(otherEquipment?.hierarchy?.name) : clean(vehicle?.hierarchy?.name),
      kilometerAtEntry,
      engineHoursAtEntry,
    };

    // ── Hitos de trazabilidad ───────────────────────────────────────────────
    const activityLog = [
      ...(order.maintenance_requests?.maintenance_activity_log ?? []),
      ...order.maintenance_activity_log,
    ];

    /** Primera ocurrencia de cada evento: el hito es cuando el paso se dio, no cuando se repitio. */
    const firstByAction = new Map<string, (typeof activityLog)[number]>();
    for (const entry of activityLog) {
      if (!firstByAction.has(entry.action_type)) firstByAction.set(entry.action_type, entry);
    }

    /**
     * El evento `work_orders_generated` recién se registra en el log desde que lo
     * agregó el código (~750 órdenes); antes el hito salía "Sin registrar" aunque
     * la OT guarda cuándo y quién la creó. El respaldo es la primera OT creada.
     */
    const firstCreatedWorkOrder = workOrders.reduce<(typeof workOrders)[number] | null>(
      (first, workOrder) =>
        workOrder.created_at && (!first?.created_at || workOrder.created_at < first.created_at) ? workOrder : first,
      null
    );

    // `operations_validated_by` apunta a auth.users (no a profile), pero comparte el
    // id con profile. Solo se consulta cuando el log no trae el autor (~6 órdenes).
    const operationsValidator =
      order.operations_validated_by && !firstByAction.get('operations_approved')?.profile?.fullname
        ? await prisma.profile.findUnique({
            where: { id: order.operations_validated_by },
            select: { fullname: true },
          })
        : null;

    /** Respaldo por hito para las ordenes que el log no cubre (las mas viejas). */
    const milestoneFallbacks: Record<string, { at: Date | null; by: string | null; note: string | null }> = {
      created: { at: order.created_at, by: null, note: null },
      scheduled: {
        at: order.scheduled_at,
        by: clean(order.profile_maintenance_orders_scheduled_byToprofile?.fullname),
        note: null,
      },
      date_confirmed: {
        at: order.date_approved_at,
        by: clean(order.profile_maintenance_orders_date_approved_byToprofile?.fullname),
        note: clean(order.date_rejection_reason),
      },
      workshop_entry: {
        at: order.workshop_entry_date,
        by: clean(order.profile_maintenance_orders_workshop_approved_byToprofile?.fullname),
        note: null,
      },
      work_orders_generated: {
        at: firstCreatedWorkOrder?.created_at ?? null,
        by: clean(firstCreatedWorkOrder?.profile_work_orders_created_byToprofile?.fullname),
        note: null,
      },
      workshop_approved: {
        at: order.workshop_validated_at,
        by: null,
        note: clean(order.workshop_validation_notes),
      },
      operations_approved: {
        at: order.operations_validated_at,
        by: clean(operationsValidator?.fullname),
        note: clean(order.operations_validation_notes),
      },
    };

    const stepMilestones: ReportMilestone[] = MILESTONE_STEPS.map((step) => {
      const entry = firstByAction.get(step.actionType);
      const fallback = milestoneFallbacks[step.actionType];

      if (entry) {
        return {
          label: step.label,
          at: entry.performed_at,
          by: clean(entry.profile?.fullname) ?? fallback?.by ?? null,
          note: clean(entry.rejection_reason) ?? clean(entry.notes) ?? fallback?.note ?? null,
        };
      }

      return {
        label: step.label,
        at: fallback?.at ?? null,
        by: fallback?.by ?? null,
        note: fallback?.note ?? null,
      };
    });

    // El evento 'created' del log NO es la creación de la solicitud: lo escribe el
    // trigger `log_maintenance_order_activity` al insertar la ORDEN (o sea, al
    // aprobarse la solicitud) y toma el autor de auth.uid(), que queda en null
    // cuando la orden la crea el servidor vía Prisma. Si la orden viene de una
    // solicitud, los dos primeros hitos salen de la solicitud misma, que sí guarda
    // quién la cargó, quién la aprobó y cuándo.
    const request = order.maintenance_requests;
    const [createdMilestone, ...restMilestones] = stepMilestones;
    const createdEntry = firstByAction.get('created');
    const driver = request?.driver_employee;
    const requestMilestones: ReportMilestone[] = request
      ? [
          {
            label: 'Solicitud generada',
            at: request.created_at ?? createdMilestone.at,
            by:
              clean(request.profile_maintenance_requests_user_idToprofile?.fullname) ??
              (driver ? `[${driver.file}] ${driver.lastname} ${driver.firstname}` : null),
            note: null,
          },
          {
            label: 'Solicitud aprobada',
            at: request.approved_at ?? createdEntry?.performed_at ?? null,
            by:
              clean(request.profile_maintenance_requests_approved_byToprofile?.fullname) ??
              clean(createdEntry?.profile?.fullname) ??
              null,
            note: null,
          },
        ]
      : [createdMilestone];

    const milestones: ReportMilestone[] = [...requestMilestones, ...restMilestones];

    // ── Ordenes de trabajo y tareas ─────────────────────────────────────────
    const reportWorkOrders: ReportWorkOrder[] = workOrders.map((workOrder, workOrderIndex) => {
      const tasks: ReportTask[] = [];

      for (const item of workOrder.work_order_items) {
        const orderItem = item.maintenance_order_items;

        for (const repair of item.work_order_item_repairs) {
          const maintenanceType = repair.types_of_repairs.type_of_maintenance;

          tasks.push({
            code: `${workOrderIndex + 1}.${tasks.length + 1}`,
            repairType: repair.types_of_repairs.name,
            description: clean(orderItem.description),
            maintenanceType,
            isCritical: orderItem.is_critical ?? false,
            // El unico tipo de reparacion sin `type_of_maintenance` es "Diagnóstico":
            // no es una reparacion, asi que el layout lo marca aparte.
            isDiagnostic: repair.is_diagnostico || orderItem.is_diagnostico || maintenanceType == null,
            statusLabel: resolveTaskStatusLabel(repair.status),
            isNonConforming:
              repair.status === 'rejected' || repair.status === 'reassignment_requested' || orderItem.is_rejected,
            completedAt: repair.completed_at,
            completedBy: clean(repair.profile_work_order_item_repairs_completed_byToprofile?.fullname),
            technicianNotes: clean(repair.technician_notes),
            workshopChiefComment: clean(orderItem.workshop_chief_comment),
            rejectionReason:
              clean(repair.rejection_reason) ?? clean(repair.return_reason) ?? clean(orderItem.rejection_reason),
          });
        }
      }

      return {
        number: workOrder.order_number,
        sector: clean(workOrder.workshop_sectors?.name),
        workshop: clean(workOrder.workshops?.name),
        isExternalWorkshop: workOrder.workshops?.type === 'externo',
        statusLabel: getWoStatusConfig(workOrder.status).label,
        priorityLabel: resolvePriorityLabel(workOrder.priority),
        plannedStart: toPlainDate(workOrder.planned_start_date),
        plannedEnd: toPlainDate(workOrder.planned_end_date),
        // `actual_start_date` / `actual_end_date` no se escriben nunca en esta base:
        // la ejecucion real vive en `started_at` / `completed_at`.
        actualStart: workOrder.started_at,
        actualEnd: workOrder.completed_at,
        completedBy: clean(workOrder.profile_work_orders_completed_byToprofile?.fullname),
        notes: clean(workOrder.notes),
        tasks,
      };
    });

    /** Cierre efectivo de la orden: el ultimo cierre entre sus OT. */
    const closedAt = workOrders.reduce<Date | null>((latest, workOrder) => {
      if (!workOrder.completed_at) return latest;
      if (!latest || workOrder.completed_at > latest) return workOrder.completed_at;
      return latest;
    }, null);

    return {
      orderNumber: clean(order.order_number) ?? 'Sin número',
      statusLabel: getMoStatusConfig(order.status).label,
      sourceLabel: resolveSourceLabel(order.source),
      preventiveType: resolvePreventiveType(order.preventive_type),
      description: clean(order.description),
      createdAt: order.created_at,
      scheduledDate: toPlainDate(order.scheduled_date),
      workshopEntryDate: order.workshop_entry_date,
      closedAt,

      equipment,
      milestones,
      workOrders: reportWorkOrders,
      materials,
      materialsTotal,

      companyName,
      logoSrc: LOGO_SRC,
      documentCode: DOCUMENT_CODE,
      documentRevision: DOCUMENT_REVISION,

      issuance: {
        at: new Date(),
        by: clean(issuer?.fullname) ?? clean(issuer?.email) ?? 'Usuario no identificado',
        // Identificador corto de la orden: permite rastrear el registro desde el papel.
        traceId: order.id.slice(0, 8),
      },
    };
  } catch (error) {
    logger.error('Error al armar los datos del PDF de orden de mantenimiento', { data: { error, orderId } });
    throw error;
  }
}
