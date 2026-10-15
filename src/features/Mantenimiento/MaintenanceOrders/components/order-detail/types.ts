import type { BadgeProps } from '@/components/ui/badge';
import { REPAIR_STATUS_UI, TONE_TO_BADGE } from '../../../lib/status-presentation';
import type { MaintenanceOrderData } from '../../actions/queries.server';

export interface SectorGroup {
  sectorId: string;
  sectorName: string;
  sequenceOrder: number;
  items: MaintenanceOrderData['maintenance_order_items'];
}

/** Tarea individual mostrada en las tarjetas de sector y en el listado de items */
export interface TaskInfo {
  id: string;
  repairTypeName: string;
  description?: string;
  status: string;
  isDiagnostico: boolean;
  isAutorizable: boolean;
  isOperatorAdded: boolean;
}

/** Variantes de badge admitidas — el estado sale de los mappers de las tablas */
export type StatusBadgeVariant = NonNullable<BadgeProps['variant']>;

/** Estado resumido de un item del pedido (derivado de sus tareas o del rechazo) */
export type ItemStatusKey = 'rejected' | 'completed' | 'in_progress' | 'pending';

export const itemStatusLabels: Record<ItemStatusKey, string> = {
  rejected: REPAIR_STATUS_UI.rejected.label,
  completed: REPAIR_STATUS_UI.completed.label,
  in_progress: REPAIR_STATUS_UI.in_progress.label,
  pending: REPAIR_STATUS_UI.pending.label,
};

export const itemStatusVariants: Record<ItemStatusKey, StatusBadgeVariant> = {
  rejected: TONE_TO_BADGE[REPAIR_STATUS_UI.rejected.tone],
  completed: TONE_TO_BADGE[REPAIR_STATUS_UI.completed.tone],
  in_progress: TONE_TO_BADGE[REPAIR_STATUS_UI.in_progress.tone],
  pending: TONE_TO_BADGE[REPAIR_STATUS_UI.pending.tone],
};

/** Represents a selectable repair item for rejection dialogs */
export interface SelectableRepair {
  repairId: string;
  repairName: string;
  sectorName: string;
  status: string;
}
