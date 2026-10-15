import {
  LEGACY_HISTORY_LABELS,
  getStatusUi,
  type StatusEntity,
} from '@/features/Mantenimiento/lib/status-presentation';
import { AlertTriangle, ArrowRight, ArrowUpDown, Calendar, CheckCircle, Clock, FileText, GitBranch, Hash, Layers, LogIn, Package, Pause, Play, Plus, Settings, Trash2, Undo2, User, Wrench, XCircle } from 'lucide-react';

/** Orden de búsqueda cuando el estado no está en la entidad pedida (el log mezcla pedidos, OTs y solicitudes). */
const ENTITY_FALLBACK_ORDER: readonly StatusEntity[] = ['order', 'request', 'workOrder', 'repair'];

/**
 * Etiqueta en español de un estado del historial. `entity` indica a qué entidad pertenece el log
 * (`maintenance_order_id` → 'order', `work_order_id` → 'workOrder', `maintenance_request_id` → 'request'):
 * así `rejected` o `completed` se leen según la entidad y no según qué mapa gane. Sin `entity` (firma
 * anterior) se asume 'order' y se cae a las demás entidades y a los estados históricos.
 * Ningún estado debe mostrarse en crudo en el historial.
 */
export function getStatusLabel(status: string | null, entity: StatusEntity = 'order'): string {
  if (!status) return '';
  const candidates = [entity, ...ENTITY_FALLBACK_ORDER.filter((candidate) => candidate !== entity)];
  for (const candidate of candidates) {
    const ui = getStatusUi(candidate, status);
    if (ui.label !== status) return ui.label;
  }
  return LEGACY_HISTORY_LABELS[status] ?? status;
}

// Mapeo de action_type a configuración visual
export const actionConfig: Record<
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
export type PerformerType =
  | { id: string; fullname: string | null; email: string | null }
  | { id: string; fullname: string | null; email: string | null }[]
  | null;

// Helper para extraer el nombre del performer
export function getPerformerName(performer: PerformerType): string | null {
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
export const BORDER_BY_TEXT_COLOR: Record<string, string> = {
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

// Helper para formatear número de orden: OT-AC976XW-SECTORDELTAL-000001 → OT-AC976XW-000001
export function formatOrderNumber(orderNumber: string): string {
  const parts = orderNumber.split('-');
  if (parts.length >= 4) {
    // OT-DOMINIO-SECTOR-NUMERO → OT-DOMINIO-NUMERO
    return `${parts[0]}-${parts[1]}-${parts[parts.length - 1]}`;
  }
  return orderNumber;
}
