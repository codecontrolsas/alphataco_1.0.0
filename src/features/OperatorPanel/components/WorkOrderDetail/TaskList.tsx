'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { RepairGroupBadge } from '@/features/Mantenimiento/shared/components/RepairGroupBadge';
import { RepairItemPhotos } from '@/features/Mantenimiento/shared/components/RepairItemPhotos';
import {
  getRepairItemDescription,
  getRepairItemImages,
  getRepairItemLabel,
} from '@/features/Mantenimiento/shared/repair-item-label';
import { Info, Play, Stethoscope } from 'lucide-react';
import { DiagnosticoCard } from './DiagnosticoCard';
import { TaskCard } from './TaskCard';

interface RepairData {
  id: string;
  status: string | null;
  technician_notes: string | null;
  return_reason: string | null;
  rejection_reason: string | null;
  is_operator_added: boolean | null;
  is_diagnostico: boolean;
  types_of_repairs: {
    id: string;
    name: string | null;
    criticity: string | null;
    autorizable: boolean | null;
  } | null;
}

/**
 * Item del pedido que origina la tarea.
 *
 * Puede venir de un desvio de checklist o de una carga manual (ticket 592), y en
 * los dos casos su titulo, aclaracion y fotos se resuelven con los helpers
 * compartidos del modulo de Mantenimiento.
 */
interface MaintenanceOrderItemData {
  description?: string | null;
  images?: string[] | null;
  types_of_repairs?: { name?: string | null } | null;
  maintenance_order_item_repair_types?: { types_of_repairs?: { name?: string | null } | null }[] | null;
  maintenance_request_items?: {
    free_text?: string | null;
    description?: string | null;
    images?: string[] | null;
    checklist_deviations?: { item_label?: string | null } | null;
  } | null;
}

interface WorkOrderItemData {
  id: string;
  status: string | null;
  /** Nombre del grupo de reparaciones del que salio el item, si vino de uno */
  group_name?: string | null;
  work_order_item_repairs: RepairData[] | null;
  maintenance_order_items: MaintenanceOrderItemData | null;
}

interface TaskListProps {
  workOrderItems: WorkOrderItemData[];
  workOrderStatus: string;
  technicianNotes: Record<string, string>;
  isMutating: boolean;
  onToggleRepair: (repairId: string, isCompleted: boolean) => void;
  onNotesChange: (repairId: string, notes: string) => void;
  onNotesSave: (repairId: string, notes: string) => void;
  onReturnTask: (repairId: string) => void;
}

const criticityOrder: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Item del pedido que origino la tarea, o null si no llego. */
function getItemData(item: WorkOrderItemData): MaintenanceOrderItemData | null {
  return item.maintenance_order_items ?? null;
}

export function TaskList({
  workOrderItems,
  workOrderStatus,
  technicianNotes,
  isMutating,
  onToggleRepair,
  onNotesChange,
  onNotesSave,
  onReturnTask,
}: TaskListProps) {
  const allRepairs = workOrderItems.flatMap((item) => item.work_order_item_repairs || []);
  const diagnosticoRepair = allRepairs.find((r) => r.is_diagnostico);
  const hasDiagnostico = !!diagnosticoRepair;
  const isDiagnosticoComplete = diagnosticoRepair?.status === 'completed';
  const isBlockedByDiag = hasDiagnostico && !isDiagnosticoComplete;
  const isPending = workOrderStatus === 'pending';
  const isPaused = workOrderStatus === 'paused';
  const isReadOnly = isPending || isPaused;

  // Flatten all regular repairs (non-diagnostico) with their description, sorted by criticity
  const sortedRegularRepairs = workOrderItems
    .flatMap((item) => {
      const moItem = getItemData(item);
      const title = moItem ? getRepairItemLabel(moItem, '') : '';
      const description = moItem ? getRepairItemDescription(moItem) : null;
      const images = moItem ? getRepairItemImages(moItem) : [];

      return (item.work_order_item_repairs || [])
        .filter((repair) => !repair.is_diagnostico)
        .map((repair) => ({
          repair,
          // El tipo de reparacion es el respaldo cuando el item no trae titulo propio
          title: title || repair.types_of_repairs?.name || 'Tarea sin tipo',
          description,
          images,
          groupName: item.group_name ?? null,
        }));
    })
    .sort((a, b) => {
      const aOrder = criticityOrder[a.repair.types_of_repairs?.criticity || 'medium'] ?? 2;
      const bOrder = criticityOrder[b.repair.types_of_repairs?.criticity || 'medium'] ?? 2;
      return aOrder - bOrder;
    });

  /**
   * Items del pedido que llegaron a la OT sin ningun trabajo asociado.
   *
   * Pasa con la carga manual de texto libre (ticket 592): al no haber tipo de
   * reparacion no se crea ningun `work_order_item_repairs`, y sin este bloque el
   * item — y sus fotos — desaparecerian del panel del taller.
   */
  const itemsWithoutRepairs = workOrderItems
    .filter((item) => (item.work_order_item_repairs || []).length === 0)
    .map((item) => {
      const moItem = getItemData(item);
      return {
        id: item.id,
        title: moItem ? getRepairItemLabel(moItem) : 'Ítem sin descripción',
        description: moItem ? getRepairItemDescription(moItem) : null,
        images: moItem ? getRepairItemImages(moItem) : [],
        groupName: item.group_name ?? null,
      };
    });

  if (allRepairs.length === 0 && itemsWithoutRepairs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No hay tareas asignadas a esta orden de trabajo
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Pending WO banner */}
      {isPending && (
        <div className="bg-info-subtle border border-info/30 rounded-lg p-3.5 flex items-center gap-3">
          <Play className="h-5 w-5 text-info flex-shrink-0" />
          <p className="text-sm text-info-subtle-foreground font-medium">
            Inicie la Orden de Trabajo antes de completar tareas
          </p>
        </div>
      )}

      {/* Diagnostico blocking banner */}
      {!isPending && hasDiagnostico && !isDiagnosticoComplete && (
        <div className="bg-warn-subtle border border-warn/30 rounded-lg p-3.5 flex items-center gap-3">
          <Stethoscope className="h-5 w-5 text-warn flex-shrink-0" />
          <p className="text-sm text-warn-subtle-foreground font-medium">
            Complete el DIAGNOSTICO antes de continuar con otras tareas
          </p>
        </div>
      )}

      {/* Diagnostico card */}
      {diagnosticoRepair && (
        <DiagnosticoCard
          repairId={diagnosticoRepair.id}
          isCompleted={diagnosticoRepair.status === 'completed'}
          notes={technicianNotes[diagnosticoRepair.id] || diagnosticoRepair.technician_notes || ''}
          savedNotes={diagnosticoRepair.technician_notes || ''}
          isMutating={isMutating}
          isDisabled={isReadOnly}
          onToggle={onToggleRepair}
          onNotesChange={onNotesChange}
          onNotesSave={onNotesSave}
        />
      )}

      {/* Separator */}
      {hasDiagnostico && allRepairs.length > 1 && <Separator />}

      {/* Regular task cards - sorted by criticity */}
      {sortedRegularRepairs.map(({ repair, title, description, images, groupName }) => (
        <TaskCard
          key={repair.id}
          repair={repair}
          title={title}
          description={description}
          images={images}
          groupName={groupName}
          isBlockedByDiag={isBlockedByDiag}
          isBlockedByPending={isReadOnly}
          isMutating={isMutating}
          localNotes={technicianNotes[repair.id] || repair.technician_notes || ''}
          onToggle={onToggleRepair}
          onNotesChange={onNotesChange}
          onNotesSave={onNotesSave}
          onReturn={onReturnTask}
        />
      ))}

      {/* Items informativos: llegaron sin trabajo asociado, no se pueden completar */}
      {itemsWithoutRepairs.map((item) => (
        <div key={item.id} className="rounded-lg border border-l-4 border-l-sky-400 bg-card">
          <div className="p-4 sm:p-5 space-y-2">
            <div className="flex items-start gap-2.5">
              <Info className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-sm font-semibold sm:text-base leading-tight">{item.title}</p>
                <RepairGroupBadge groupName={item.groupName} />
                <p className="text-xs text-muted-foreground">
                  Ítem informativo del pedido: no tiene un tipo de reparación asignado, por eso no se marca como
                  completado.
                </p>
                {item.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                )}
                <RepairItemPhotos images={item.images} label={item.title} size="md" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
