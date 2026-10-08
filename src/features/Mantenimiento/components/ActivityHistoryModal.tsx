'use client';

import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { statusLabels as maintenanceOrderStatusLabels } from '@/features/Mantenimiento/MaintenanceOrders/table/columns';
import { getMaintenanceOrderActivityLog, getMaintenanceOrderFullActivityLog, getMaintenanceRequestFullActivityLog, getWorkOrderFullActivityLog, type MaintenanceRequestOrigin } from '@/features/Mantenimiento/Operaciones/actions/activity-log.server';
import { WORK_ORDER_STATUS_LABELS } from '@/features/Mantenimiento/shared/work-order-types';
import {
  ACTIVITY_STAGE_DESCRIPTIONS,
  ACTIVITY_STAGE_LABELS,
  ACTIVITY_STAGE_ORDER,
  getActivityStage,
  type ActivityStage,
} from '@/features/Mantenimiento/shared/activity-log/stages';
import { formatDateTime } from '@/features/Mantenimiento/utils/dateFormat';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  Calendar,
  CheckCircle,
  ClipboardCheck,
  Clock,
  FileText,
  GitBranch,
  Hash,
  Layers,
  LogIn,
  Package,
  Pause,
  Play,
  Plus,
  Settings,
  Trash2,
  Truck,
  Undo2,
  User,
  Wrench,
  XCircle,
} from 'lucide-react';
import moment from 'moment';
import { useMemo } from 'react';
import { ActivityHistorySkeleton } from './ActivityHistory/ActivityHistorySkeleton';
import { GroupedActionItem } from './ActivityHistory/GroupedActionItem';
import { RequestItemComments } from './ActivityHistory/RequestItemComments';
import { WorkOrderAccordion } from './ActivityHistory/WorkOrderAccordion';

interface ActivityHistoryModalProps {
  open: boolean;
  onClose: () => void;
  maintenanceOrderId?: string | null;
  maintenanceRequestId?: string | null;
  workOrderId?: string | null;
  title?: string;
}

/**
 * Estados que no cubren los mappers existentes del modulo: son los del tramo previo
 * del circuito (solicitud y planificacion de fecha). El resto se reutiliza de
 * `statusLabels` de la tabla de pedidos y de `WORK_ORDER_STATUS_LABELS`, para no
 * mantener dos mapeos distintos del mismo estado.
 */
const extraStatusLabels: Record<string, string> = {
  pending_scheduling: 'Pendiente de programación',
  date_confirmed: 'Fecha confirmada',
  date_rejected: 'Fecha rechazada',
  pending_approval: 'Pendiente de aprobación',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

/**
 * Mapeo unico de estados a español: pedidos + ordenes de trabajo + solicitudes.
 * Ningun estado debe mostrarse en crudo en el historial (el cliente reporto ver
 * "pending_workshop_validation" sin traducir).
 */
const statusLabels: Record<string, string> = {
  ...maintenanceOrderStatusLabels,
  ...WORK_ORDER_STATUS_LABELS,
  ...extraStatusLabels,
};

// Función para obtener el label en español de un status
function getStatusLabel(status: string | null): string {
  if (!status) return '';
  return statusLabels[status] || status;
}

// Mapeo de action_type a configuración visual
const actionConfig: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
  }
> = {
  // Acciones de maintenance_orders (Pedido/Solicitud)
  created: { label: 'Pedido creado', icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-50' },
  scheduled: { label: 'Fecha programada', icon: Calendar, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  date_confirmed: { label: 'Fecha confirmada', icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  date_rejected: { label: 'Fecha rechazada', icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-50' },
  workshop_entry: { label: 'Ingreso a taller', icon: LogIn, color: 'text-purple-600', bgColor: 'bg-purple-50' },
  rejected: { label: 'Pedido rechazado', icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-50' },

  // Acciones de work_orders (Orden de Trabajo)
  work_order_created: {
    label: 'Orden de trabajo creada',
    icon: GitBranch,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
  },
  started: { label: 'Trabajo iniciado', icon: Play, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  paused: { label: 'Trabajo pausado', icon: Pause, color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
  resumed: { label: 'Trabajo reanudado', icon: Play, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  completed: { label: 'Completado', icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-50' },
  completed_partial: {
    label: 'Completado parcialmente',
    icon: AlertTriangle,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
  },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-50' },

  // Otras acciones
  status_changed: { label: 'Estado actualizado', icon: Clock, color: 'text-gray-600', bgColor: 'bg-gray-50' },
  comment_added: { label: 'Comentario agregado', icon: User, color: 'text-gray-600', bgColor: 'bg-gray-50' },

  // Gestión de items y OM
  order_items_updated: {
    label: 'Gestión de items actualizada',
    icon: Settings,
    color: 'text-slate-600',
    bgColor: 'bg-slate-50',
  },
  order_items_assigned: {
    label: 'Items asignados a sectores',
    icon: Layers,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  order_item_added: { label: 'Item agregado', icon: Plus, color: 'text-green-600', bgColor: 'bg-green-50' },
  order_item_repair_types_updated: {
    label: 'Tipos de reparación actualizados',
    icon: Wrench,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
  },
  order_item_removed: { label: 'Item eliminado', icon: Trash2, color: 'text-red-600', bgColor: 'bg-red-50' },
  order_number_generated: {
    label: 'Número de OM generado',
    icon: Hash,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
  },
  work_orders_generated: { label: 'OTs generadas', icon: GitBranch, color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
  work_order_completed: {
    label: 'Orden de trabajo finalizada',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },

  workshop_returned_order: {
    label: 'OM devuelta al taller',
    icon: Undo2,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  sector_execution_order_updated: {
    label: 'Orden de sectores actualizado',
    icon: ArrowUpDown,
    color: 'text-slate-600',
    bgColor: 'bg-slate-50',
  },
  external_wo_completed: {
    label: 'OT externa completada',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },

  repair_task_approved: { label: 'Tarea aprobada', icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-50' },
  repair_task_rejected: { label: 'Tarea rechazada', icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-50' },
  repair_task_reassigned: {
    label: 'Tarea reasignada a otro sector',
    icon: ArrowRight,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },

  wo_started: { label: 'OT iniciada', icon: Play, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  wo_paused: { label: 'OT pausada', icon: Pause, color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
  wo_resumed: { label: 'OT reanudada', icon: Play, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  wo_closed: { label: 'OT cerrada', icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-50' },
  repair_completed: {
    label: 'Reparación completada',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  repair_uncompleted: { label: 'Reparación reabierta', icon: Undo2, color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
  repair_technician_notes_updated: {
    label: 'Notas del técnico actualizadas',
    icon: FileText,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
  },
  repair_returned_to_chief: {
    label: 'Tarea devuelta al jefe',
    icon: Undo2,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  task_added_by_operator: {
    label: 'Tarea agregada por operario',
    icon: Plus,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  task_requested_for_other_sector: {
    label: 'Tarea solicitada a otro sector',
    icon: ArrowRight,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  material_request_created: {
    label: 'Pedido de materiales',
    icon: Package,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
  },

  approved: { label: 'Solicitud aprobada', icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-50' },
};

// Tipo para el performer (puede venir como objeto o array de Supabase)
type PerformerType =
  | { id: string; fullname: string | null; email: string | null }
  | { id: string; fullname: string | null; email: string | null }[]
  | null;

// Helper para extraer el nombre del performer
function getPerformerName(performer: PerformerType): string | null {
  if (!performer) return null;
  if (Array.isArray(performer)) {
    return performer[0]?.fullname || null;
  }
  return performer.fullname;
}

/**
 * Borde del círculo del timeline, por color de icono.
 *
 * Las clases van escritas completas porque Tailwind v4 sólo emite las que
 * encuentra literales en el código; componerlas con `replace()` deja sin estilo
 * a las familias que no aparecen escritas en ningún otro archivo.
 */
const BORDER_BY_TEXT_COLOR: Record<string, string> = {
  'text-blue-600': 'border-blue-600',
  'text-cyan-600': 'border-cyan-600',
  'text-emerald-600': 'border-emerald-600',
  'text-gray-600': 'border-gray-600',
  'text-green-600': 'border-green-600',
  'text-indigo-600': 'border-indigo-600',
  'text-orange-600': 'border-orange-600',
  'text-purple-600': 'border-purple-600',
  'text-red-600': 'border-red-600',
  'text-slate-600': 'border-slate-600',
  'text-yellow-600': 'border-yellow-600',
};

// Componente para renderizar un item del timeline
function TimelineItem({
  entry,
  isLast,
  showSource,
}: {
  entry: {
    id: string;
    action_type: string;
    performed_at: string | Date;
    performer?: PerformerType;
    notes?: string | null;
    rejection_reason?: string | null;
    new_status?: string | null;
    previous_status?: string | null;
    metadata?: Record<string, unknown> | null;
    source?: 'order' | 'work_order';
    sourceLabel?: string;
  };
  isLast: boolean;
  showSource?: boolean;
}) {
  const config = actionConfig[entry.action_type] || {
    label: entry.action_type,
    icon: Clock,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
  };
  const Icon = config.icon;
  const performerName = getPerformerName(entry.performer ?? null);

  // Extraer datos del metadata si existen
  const metadata = entry.metadata as Record<string, unknown> | null;
  const pauseReason = metadata?.pause_reason as string | undefined;
  const totalPausedTime = metadata?.total_paused_time as string | undefined;
  const scheduledDate = metadata?.scheduled_date as string | undefined;
  const kilometerAtEntry = metadata?.kilometer_at_entry as string | undefined;
  const engineHoursAtEntry = metadata?.engine_hours_at_entry as number | undefined;
  const workOrderNumber = metadata?.work_order_number as string | undefined;
  const workOrderSectorName = metadata?.sector_name as string | undefined;

  return (
    <div className="relative flex items-start gap-3 pl-1">
      {/* Línea conectora */}
      {!isLast && <div className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-muted" />}

      {/* Icono del timeline.
          El borde sale del mapa y NO de `config.color.replace('text-','border-')`:
          Tailwind v4 escanea el código como texto, así que una clase armada en
          runtime nunca se emite. De las 11 familias de `actionConfig`, cinco
          (red, purple, indigo, cyan, emerald) no aparecían literalmente en `src/`
          y esos círculos quedaban sin color de borde. */}
      <div
        className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${config.bgColor} ${BORDER_BY_TEXT_COLOR[config.color] ?? 'border-gray-600'}`}
      >
        <Icon className={`h-4 w-4 ${config.color}`} />
      </div>

      {/* Contenido */}
      <div className="flex-1 pt-0.5 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{config.label}</span>

          {/* Badge de source si se muestra */}
          {showSource && entry.sourceLabel && (
            <Badge variant={entry.source === 'order' ? 'secondary' : 'default'} className="text-xs">
              {entry.source === 'order' ? 'Pedido' : 'OT'}
            </Badge>
          )}

          {/* Badge de estado en español: si hubo transicion se muestra "anterior → nuevo" */}
          {entry.new_status && (
            <Badge variant="outline" className="text-xs inline-flex items-center gap-1">
              {entry.previous_status && entry.previous_status !== entry.new_status && (
                <>
                  <span className="text-muted-foreground">{getStatusLabel(entry.previous_status)}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </>
              )}
              {getStatusLabel(entry.new_status)}
            </Badge>
          )}
        </div>

        {/* Usuario que realizó la acción */}
        {performerName && (
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
            <User className="h-3 w-3" />
            {performerName}
          </p>
        )}

        {/* Notas */}
        {entry.notes && entry.notes !== config.label && (
          <p className="text-sm text-muted-foreground mt-1 italic">&ldquo;{entry.notes}&rdquo;</p>
        )}

        {/* Motivo de rechazo */}
        {entry.rejection_reason && (
          <div className="mt-1 p-2 bg-red-50 dark:bg-red-950/30 rounded text-sm text-red-700 dark:text-red-300">
            <span className="font-medium">Motivo:</span> {entry.rejection_reason}
          </div>
        )}

        {/* Motivo de pausa - solo mostrar en acción paused, sin el tiempo (aún no se calculó) */}
        {pauseReason && entry.action_type === 'paused' && (
          <div className="mt-1 p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded text-sm text-yellow-700 dark:text-yellow-300">
            <span className="font-medium">Motivo de pausa:</span> {pauseReason}
          </div>
        )}

        {/* Metadatos del evento + timestamp en una sola fila que envuelve.
            Antes cada dato ocupaba su propio renglon y estiraba el timeline en vertical;
            al ensanchar el modal entran todos juntos y el historial se lee de un vistazo. */}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {/* Tiempo total pausado - solo mostrar en resumed/completed cuando hay tiempo real (no 00:00:00) */}
          {totalPausedTime && totalPausedTime !== '00:00:00' && entry.action_type !== 'paused' && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Tiempo total pausado: {totalPausedTime}
            </span>
          )}

          {/* Fecha programada (se guarda en ISO, se muestra en formato local) */}
          {scheduledDate && entry.action_type === 'scheduled' && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Fecha: {moment(scheduledDate).isValid() ? moment(scheduledDate).format('DD/MM/YYYY') : scheduledDate}
            </span>
          )}

          {/* OT finalizada: de que orden de trabajo y sector se trata */}
          {entry.action_type === 'work_order_completed' && (workOrderNumber || workOrderSectorName) && (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              {workOrderNumber ? formatOrderNumber(workOrderNumber) : 'Orden de trabajo'}
              {workOrderSectorName ? ` · ${workOrderSectorName}` : ''}
            </span>
          )}

          {/* Kilometraje al ingresar */}
          {kilometerAtEntry && (
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3 w-3" />
              Kilometraje: {kilometerAtEntry} km
            </span>
          )}

          {/* Horómetro al ingresar */}
          {engineHoursAtEntry != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Horómetro: {engineHoursAtEntry} hs
            </span>
          )}

          {/* Timestamp */}
          <span>{formatDateTime(entry.performed_at)}</span>
        </div>
      </div>
    </div>
  );
}

// Helper para formatear número de orden: OT-AC976XW-SECTORDELTAL-000001 → OT-AC976XW-000001
function formatOrderNumber(orderNumber: string): string {
  const parts = orderNumber.split('-');
  if (parts.length >= 4) {
    // OT-DOMINIO-SECTOR-NUMERO → OT-DOMINIO-NUMERO
    return `${parts[0]}-${parts[1]}-${parts[parts.length - 1]}`;
  }
  return orderNumber;
}

// Componente para mostrar OTs hermanas (más compacto)
function SiblingWorkOrders({ siblings }: { siblings: { id: string; order_number: string; status: string }[] }) {
  if (siblings.length === 0) return null;

  return (
    <div className="mb-3 p-2 bg-muted/50 rounded-md">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          Otras OTs:
        </span>
        {siblings.map((wo) => (
          <Badge key={wo.id} variant="secondary" className="text-xs font-normal">
            {formatOrderNumber(wo.order_number)}
            <span className="ml-1 text-muted-foreground">• {getStatusLabel(wo.status)}</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}

// Componente para mostrar el origen de la solicitud (Paso 1)
function OriginItem({ origin, hasMoreItems }: { origin: MaintenanceRequestOrigin; hasMoreItems: boolean }) {
  const isChecklist = origin.type === 'checklist';

  return (
    <div className="relative flex items-start gap-3 pl-1">
      {/* Línea conectora */}
      {hasMoreItems && <div className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-muted" />}

      {/* Icono del timeline */}
      <div
        className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${
          isChecklist ? 'bg-blue-50 border-blue-600' : 'bg-orange-50 border-orange-600'
        }`}
      >
        {isChecklist ? (
          <ClipboardCheck className="h-4 w-4 text-blue-600" />
        ) : (
          <FileText className="h-4 w-4 text-orange-600" />
        )}
      </div>

      {/* Contenido */}
      <div className="flex-1 pt-0.5 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">
            {isChecklist ? 'Origen: Inspección de Checklist' : 'Origen: Pedido Manual'}
          </span>
          <Badge variant={isChecklist ? 'default' : 'secondary'} className="text-xs">
            {isChecklist ? 'Checklist' : 'Manual'}
          </Badge>
        </div>

        {isChecklist && origin.checklist ? (
          // Datos del checklist en dos columnas: al ensanchar el modal la lista apilada
          // dejaba mucho aire a la derecha y alargaba la tarjeta innecesariamente.
          <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md text-sm grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {(origin.driverEmployee || origin.checklist?.chofer) && (
              <p className="flex items-center gap-1 text-blue-800 dark:text-blue-200">
                <User className="h-3 w-3" />
                <span className="font-medium">Chofer:</span>
                {origin.driverEmployee ? (
                  <>
                    {origin.driverEmployee.file && (
                      <span className="text-xs font-mono bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 rounded">
                        {origin.driverEmployee.file}
                      </span>
                    )}
                    <span>
                      {origin.driverEmployee.lastname} {origin.driverEmployee.firstname}
                    </span>
                  </>
                ) : (
                  <span>{origin.checklist?.chofer}</span>
                )}
              </p>
            )}
            {origin.checklist.fecha && (
              <p className="flex items-center gap-1 text-blue-800 dark:text-blue-200">
                <Calendar className="h-3 w-3" />
                <span className="font-medium">Fecha inspección:</span> {origin.checklist.fecha}
                {origin.checklist.hora && ` a las ${origin.checklist.hora}`}
              </p>
            )}
            {origin.checklist.kilometraje && (
              <p className="flex items-center gap-1 text-blue-800 dark:text-blue-200">
                <Truck className="h-3 w-3" />
                <span className="font-medium">Kilometraje:</span> {origin.checklist.kilometraje} km
              </p>
            )}
            {origin.checklist.respondedBy?.fullname && (
              <p className="text-xs text-blue-600 dark:text-blue-300 mt-1 sm:col-span-2">
                Registrado por: {origin.checklist.respondedBy.fullname}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-2 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-md text-sm">
            <p className="text-orange-800 dark:text-orange-200">
              Solicitud creada directamente desde el módulo de mantenimiento
            </p>
            {origin.manualCreator?.fullname && (
              <p className="text-xs text-orange-600 dark:text-orange-300 mt-1">
                Creado por: {origin.manualCreator.fullname}
              </p>
            )}
          </div>
        )}

        {/* Timestamp del origen */}
        {origin.createdAt && <p className="text-xs text-muted-foreground mt-2">{formatDateTime(origin.createdAt)}</p>}
      </div>
    </div>
  );
}

export function ActivityHistoryModal({
  open,
  onClose,
  maintenanceOrderId,
  maintenanceRequestId,
  workOrderId,
  title = 'Historial de Actividades',
}: ActivityHistoryModalProps) {
  // Determinar el tipo de vista
  const isWorkOrderView = !!workOrderId;
  const isOrderView = !workOrderId && !!maintenanceOrderId;
  const isRequestOnlyView = !workOrderId && !maintenanceOrderId && !!maintenanceRequestId;

  // Query para historial completo de Work Order (incluye solicitud)
  const { data: fullWorkOrderLog, isLoading: isLoadingFullWO } = useQuery({
    queryKey: ['work-order-full-activity-log', workOrderId],
    queryFn: () => getWorkOrderFullActivityLog(workOrderId!),
    enabled: open && isWorkOrderView,
  });

  // Query para historial completo de maintenance_order (incluye origen desde request)
  const { data: fullOrderLog, isLoading: isLoadingFullOrder } = useQuery({
    queryKey: ['maintenance-order-full-activity-log', maintenanceOrderId, maintenanceRequestId],
    queryFn: () => getMaintenanceOrderFullActivityLog(maintenanceOrderId!, maintenanceRequestId || undefined),
    enabled: open && isOrderView,
  });

  // Query para historial completo de maintenance_request SOLO (sin order asociado)
  const { data: fullRequestLog, isLoading: isLoadingFullRequest } = useQuery({
    queryKey: ['maintenance-request-full-activity-log', maintenanceRequestId],
    queryFn: () => getMaintenanceRequestFullActivityLog(maintenanceRequestId!),
    enabled: open && isRequestOnlyView,
  });

  const isLoading = isLoadingFullWO || isLoadingFullOrder || isLoadingFullRequest;

  // Obtener el log de actividades según el tipo de vista
  let activityLog: Awaited<ReturnType<typeof getMaintenanceOrderActivityLog>> = [];
  if (isWorkOrderView) {
    activityLog = fullWorkOrderLog?.history || [];
  } else if (isOrderView) {
    activityLog = fullOrderLog?.history || [];
  } else if (isRequestOnlyView) {
    activityLog = fullRequestLog?.history || [];
  }

  // Obtener el origen (para Order view y Request only view)
  const requestOrigin = isOrderView ? fullOrderLog?.origin : isRequestOnlyView ? fullRequestLog?.origin : null;

  /**
   * Comentarios cargados sobre los items del pedido (ticket 649). Se resuelven en
   * las tres vistas: aunque la de OT no muestra el bloque de origen, los
   * comentarios del pedido son parte del historial que el taller necesita leer.
   */
  const itemComments = isWorkOrderView
    ? fullWorkOrderLog?.itemComments ?? []
    : isOrderView
      ? fullOrderLog?.itemComments ?? []
      : fullRequestLog?.itemComments ?? [];

  const siblingWorkOrders = isWorkOrderView ? fullWorkOrderLog?.siblingWorkOrders : [];
  const vehicleInfo = isWorkOrderView ? fullWorkOrderLog?.vehicleInfo : null;

  /**
   * Historial de la OM repartido en las tres etapas del circuito (ticket 649).
   * Se omiten las etapas sin eventos para no dejar títulos vacíos.
   */
  const stagedActivityLog = useMemo(() => {
    const byStage = new Map<ActivityStage, typeof activityLog>();
    for (const entry of activityLog) {
      const stage = getActivityStage(entry);
      const bucket = byStage.get(stage);
      if (bucket) bucket.push(entry);
      else byStage.set(stage, [entry]);
    }
    // "Pedido" se dibuja aunque no tenga eventos propios cuando hay que colgarle
    // el origen o los comentarios de los items: si no, quedarían sin encabezado.
    const keepEmptyRequestStage = Boolean(requestOrigin) || itemComments.length > 0;

    return ACTIVITY_STAGE_ORDER.filter(
      (stage) => (byStage.get(stage)?.length ?? 0) > 0 || (stage === 'request' && keepEmptyRequestStage)
    ).map((stage) => ({
      stage,
      entries: byStage.get(stage) ?? [],
    }));
  }, [activityLog, requestOrigin, itemComments.length]);

  /** La etapa Taller ya tiene eventos propios en el timeline (ver más abajo) */
  const hasWorkshopStage = stagedActivityLog.some(({ stage }) => stage === 'workshop');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* El ancho va con `sm:` a propósito (ticket 649): la clase base de
          DialogContent trae `sm:max-w-2xl` y un `max-w-*` sin modifier no le gana
          en el CSS, así que el modal quedaba angosto y muy alto. */}
      <DialogContent className="sm:max-w-6xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {isWorkOrderView ? (
              <span className="flex items-center gap-2">
                Historial completo desde la solicitud hasta la orden de trabajo
                {vehicleInfo && (
                  <Badge variant="outline">
                    <Truck className="h-3 w-3 mr-1" />
                    {vehicleInfo.domain || vehicleInfo.intern_number}
                  </Badge>
                )}
              </span>
            ) : (
              'Registro de todas las acciones realizadas'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Scroll nativo en vez de ScrollArea (ticket 649): el viewport de Radix
            se dimensiona con `height: 100%`, que no resuelve contra un padre cuya
            altura la fija el flex — quedaba en la altura del contenido (758px
            dentro de un area de 367px) y el historial se cortaba sin barra. */}
        {/* `tabIndex` porque una región scrolleable sin elementos focusables adentro
            (p. ej. la vista de solicitud) no se puede recorrer con teclado — antes
            lo resolvía el viewport de Radix. */}
        <div
          className="flex-1 min-h-0 overflow-y-auto pr-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          tabIndex={0}
          aria-label="Historial de actividades"
        >
          {isLoading ? (
            <ActivityHistorySkeleton showWorkOrders={isOrderView} />
          ) : (activityLog && activityLog.length > 0) || requestOrigin || itemComments.length > 0 ? (
            <div>
              {/* Mostrar OTs hermanas si es vista de work order */}
              {isWorkOrderView && siblingWorkOrders && siblingWorkOrders.length > 0 && (
                <SiblingWorkOrders siblings={siblingWorkOrders} />
              )}

              {/* En la vista de OT no hay bloque de origen, así que los comentarios
                  del pedido se muestran arriba de todo (ticket 649) */}
              {isWorkOrderView && itemComments.length > 0 && (
                <div className="relative">
                  <RequestItemComments comments={itemComments} hasMoreItems={activityLog.length > 0} />
                </div>
              )}

              {/* Timeline.
                  En la vista de OM se divide en las tres etapas del circuito
                  (ticket 649); en las otras vistas sigue siendo una sola lista. */}
              {isOrderView ? (
                <div className="space-y-5">
                  {stagedActivityLog.map(({ stage, entries }) => {
                    // El origen y los comentarios de los items pertenecen a la etapa
                    // "Pedido": dejarlos sueltos arriba empujaba el primer encabezado
                    // fuera de la pantalla y los dejaba sin etapa a la que pertenecer.
                    const isFirstStage = stage === 'request';
                    return (
                      <div key={stage}>
                        <div className="sticky top-0 z-20 mb-2 flex items-baseline gap-2 border-b bg-background pb-1 pt-1">
                          <h3 className="text-sm font-semibold">{ACTIVITY_STAGE_LABELS[stage]}</h3>
                          <span className="text-xs text-muted-foreground">{ACTIVITY_STAGE_DESCRIPTIONS[stage]}</span>
                        </div>
                        <div className="relative">
                          {isFirstStage && requestOrigin && (
                            <OriginItem
                              origin={requestOrigin}
                              hasMoreItems={itemComments.length > 0 || entries.length > 0}
                            />
                          )}
                          {isFirstStage && (
                            <RequestItemComments comments={itemComments} hasMoreItems={entries.length > 0} />
                          )}
                          {entries.map((entry, index) =>
                            entry.action_type === 'order_items_updated' ? (
                              <GroupedActionItem
                                key={entry.id}
                                performedAt={entry.performed_at}
                                performerName={getPerformerName(entry.performer ?? null)}
                                metadata={entry.metadata as Parameters<typeof GroupedActionItem>[0]['metadata']}
                                isLast={index === entries.length - 1}
                              />
                            ) : (
                              <TimelineItem
                                key={entry.id}
                                entry={entry as Parameters<typeof TimelineItem>[0]['entry']}
                                isLast={index === entries.length - 1}
                              />
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="relative">
                  {/* Mostrar origen como primer item (para vista de solicitud) */}
                  {requestOrigin && (
                    <OriginItem
                      origin={requestOrigin}
                      hasMoreItems={activityLog.length > 0 || itemComments.length > 0}
                    />
                  )}

                  {/* Comentarios sobre los items del pedido (ticket 649) */}
                  {!isWorkOrderView && (
                    <RequestItemComments comments={itemComments} hasMoreItems={activityLog.length > 0} />
                  )}

                  {activityLog.map((entry, index) => {
                    if (entry.action_type === 'order_items_updated') {
                      return (
                        <GroupedActionItem
                          key={entry.id}
                          performedAt={entry.performed_at}
                          performerName={getPerformerName(entry.performer ?? null)}
                          metadata={entry.metadata as Parameters<typeof GroupedActionItem>[0]['metadata']}
                          isLast={index === activityLog.length - 1}
                        />
                      );
                    }
                    return (
                      <TimelineItem
                        key={entry.id}
                        entry={entry as Parameters<typeof TimelineItem>[0]['entry']}
                        isLast={index === activityLog.length - 1}
                        showSource={isWorkOrderView}
                      />
                    );
                  })}
                </div>
              )}

              {/* Órdenes de Trabajo (solo en vista de OM).
                  Es la etapa "Taller" del ticket 649: la ejecución se loguea contra
                  cada OT, así que sus eventos no están en el timeline de la OM sino
                  en estos acordeones. Va bajo el mismo encabezado de etapa que las
                  dos anteriores para que las tres se lean como una sola secuencia. */}
              {isOrderView && fullOrderLog?.workOrders && fullOrderLog.workOrders.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    {/* El encabezado solo si la etapa no se dibujó ya arriba con
                        eventos propios (p. ej. `work_order_completed`, que se loguea
                        contra la OM y no contra la OT). */}
                    {!hasWorkshopStage && (
                      <div className="mb-2 flex items-baseline gap-2 border-b pb-1">
                        <h3 className="text-sm font-semibold">{ACTIVITY_STAGE_LABELS.workshop}</h3>
                        <span className="text-xs text-muted-foreground">{ACTIVITY_STAGE_DESCRIPTIONS.workshop}</span>
                      </div>
                    )}
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <GitBranch className="h-4 w-4" />
                      Órdenes de Trabajo ({fullOrderLog.workOrders.length})
                    </h4>
                    {fullOrderLog.workOrders.map((wo, idx) => (
                      <WorkOrderAccordion
                        key={wo.id}
                        workOrder={{
                          id: wo.id,
                          orderNumber: wo.orderNumber,
                          status: wo.status,
                          sectorName: wo.sectorName,
                          isExternal: wo.isExternal,
                        }}
                        defaultOpen={fullOrderLog.workOrders.length === 1 || idx === 0}
                      >
                        {wo.history.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Sin actividad registrada en esta OT.</p>
                        ) : (
                          <div className="relative">
                            {wo.history.map((entry, i) => {
                              if (entry.action_type === 'order_items_updated') {
                                return (
                                  <GroupedActionItem
                                    key={entry.id}
                                    performedAt={entry.performed_at}
                                    performerName={getPerformerName(entry.performer ?? null)}
                                    metadata={entry.metadata as Parameters<typeof GroupedActionItem>[0]['metadata']}
                                    isLast={i === wo.history.length - 1}
                                  />
                                );
                              }
                              return (
                                <TimelineItem
                                  key={entry.id}
                                  entry={entry as Parameters<typeof TimelineItem>[0]['entry']}
                                  isLast={i === wo.history.length - 1}
                                />
                              );
                            })}
                          </div>
                        )}
                      </WorkOrderAccordion>
                    ))}
                  </div>
                </>
              )}

              {/* Separador y leyenda si es vista de work order */}
              {isWorkOrderView && (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">
                        Pedido
                      </Badge>
                      = Solicitud original
                    </span>
                    <span className="flex items-center gap-1">
                      <Badge variant="default" className="text-xs">
                        OT
                      </Badge>
                      = Orden de trabajo
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Sin historial registrado</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
