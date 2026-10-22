import { type TimelineTone } from '@/shared/components/common/Timeline';
import { dailyReportRowStatusLabels, dailyReportTypeServiceLabels } from '@/shared/utils/mappers';
import { Info, LinkIcon, PlusCircle, RotateCcw, Truck, Users, Wrench, X } from 'lucide-react';
import type { DailyReportHistoryEntry } from '../../types';

// ============================================================================
// HELPERS — Action type display
// ============================================================================

export type ActionType = string;

export function getActionIcon(actionType: ActionType) {
  switch (actionType) {
    case 'UPDATE':
      return <RotateCcw className="h-4 w-4" aria-hidden="true" />;
    case 'LINK':
      return <LinkIcon className="h-4 w-4" aria-hidden="true" />;
    case 'UNLINK':
      return <X className="h-4 w-4" aria-hidden="true" />;
    case 'CREATE':
      return <PlusCircle className="h-4 w-4" aria-hidden="true" />;
    default:
      return <Info className="h-4 w-4" aria-hidden="true" />;
  }
}

export function getActionTone(actionType: ActionType): TimelineTone {
  switch (actionType) {
    case 'CREATE':
      return 'ok';
    case 'UNLINK':
      return 'warn';
    case 'DELETE':
      return 'danger';
    default:
      return 'brand';
  }
}

export function getActionName(actionType: ActionType) {
  switch (actionType) {
    case 'UPDATE':
      return 'Actualización';
    case 'LINK':
      return 'Vinculación';
    case 'UNLINK':
      return 'Desvinculación';
    case 'CREATE':
      return 'Creación';
    case 'DELETE':
      return 'Eliminación';
    default:
      return actionType;
  }
}

// ============================================================================
// HELPERS — Field translations
// ============================================================================

const fieldTranslations: Record<string, string> = {
  completed_night: 'Completado Nocturno',
  completed_day: 'Completado Diurno',
  status: 'Estado',
  description: 'Descripción',
  start_time: 'Hora de Inicio',
  end_time: 'Hora de Fin',
  type_service: 'Tipo de Servicio',
  service_type: 'Tipo de Servicio',
  working_day: 'Jornada Laboral',
  customer: 'Cliente',
  customer_id: 'Cliente',
  customer_name: 'Cliente',
  service: 'Servicio',
  service_id: 'Servicio',
  service_name: 'Servicio',
  item: 'Ítem',
  item_id: 'Ítem',
  item_name: 'Ítem',
  remit_number: 'Nro Remito',
  cancel_reason: 'Motivo de Cancelación',
  sector_name: 'Sector',
  area_name: 'Área',
};

export function getFieldDisplayName(field: string) {
  return fieldTranslations[field] ?? field.replace(/_/g, ' ');
}

export function getValueDisplay(value: unknown, field: string): string {
  if (value === null || value === undefined) return 'Sin valor';
  if (field === 'completed_night' || field === 'completed_day') {
    return value === true || value === 'true' ? 'Completado' : 'No completado';
  }
  if (field === 'status') {
    return dailyReportRowStatusLabels[String(value)] ?? String(value).replace(/_/g, ' ');
  }
  if (field === 'type_service') {
    return dailyReportTypeServiceLabels[String(value)] ?? String(value).replace(/_/g, ' ');
  }
  return String(value);
}

// ============================================================================
// HELPERS — Determine relation type from raw DB data
// ============================================================================

export type RelationType = 'employee' | 'vehicle' | 'other_equipment' | 'customer_equipment' | 'unknown';

export function getRelationType(entry: DailyReportHistoryEntry): RelationType {
  const table = entry.related_table;
  if (table === 'dailyreportemployeerelations') return 'employee';
  if (table === 'dailyreportequipmentrelations') {
    // Distinguish vehicle vs other_equipment via changed_data
    const data = entry.changed_data as Record<string, unknown> | null;
    if (data?.tipo_equipo === 'other_equipment') return 'other_equipment';
    return 'vehicle';
  }
  if (table === 'dailyreport_customer_equipment_relations') return 'customer_equipment';
  return 'unknown';
}

export function getRelationBadgeLabel(relType: RelationType): string {
  switch (relType) {
    case 'employee':
      return 'Empleado';
    case 'vehicle':
      return 'Vehículo';
    case 'other_equipment':
      return 'Otro Equipo';
    case 'customer_equipment':
      return 'Equipo Cliente';
    default:
      return 'Recurso';
  }
}

export function getRelationIcon(relType: RelationType) {
  switch (relType) {
    case 'employee':
      return <Users className="h-3 w-3 mr-1" aria-hidden="true" />;
    case 'vehicle':
      return <Truck className="h-3 w-3 mr-1" aria-hidden="true" />;
    case 'other_equipment':
      return <Wrench className="h-3 w-3 mr-1" aria-hidden="true" />;
    default:
      return null;
  }
}
